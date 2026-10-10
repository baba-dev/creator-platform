"use strict";
// Opt-in encrypted scratchpad. The passphrase and plaintext never enter a cache,
// server request or persistent storage.
const dbName = "creators-offline-pad-v1";
const status = document.querySelector("#pad-status");
const editor = document.querySelector("#pad-text");
const secret = document.querySelector("#pad-passphrase");
const save = document.querySelector("#pad-save");
const unlock = document.querySelector("#pad-unlock");
const erase = document.querySelector("#pad-erase");
const note = (message) => {
  status.textContent = message;
};
const enc = new TextEncoder();
const dec = new TextDecoder();
const supported = Boolean(window.crypto?.subtle && window.indexedDB);
if (!supported) {
  note("Encrypted drafts are unavailable on this device.");
  save.disabled = true;
  unlock.disabled = true;
  erase.disabled = true;
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("notes");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("notes", "readonly");
      const request = tx.objectStore("notes").get("scratchpad");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function write(record) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("notes", "readwrite");
      tx.objectStore("notes").put(record, "scratchpad");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function remove() {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("notes", "readwrite");
      tx.objectStore("notes").delete("scratchpad");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function key(passphrase, salt) {
  const source = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function decrypt(record, passphrase) {
  const secretKey = await key(passphrase, new Uint8Array(record.salt));
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(record.iv) },
    secretKey,
    new Uint8Array(record.ciphertext),
  );
  return dec.decode(bytes);
}
async function action(callback) {
  save.disabled = true;
  unlock.disabled = true;
  erase.disabled = true;
  try {
    await callback();
  } catch {
    note(
      "Unable to open or save the draft. Verify the passphrase and available device storage.",
    );
  } finally {
    save.disabled = false;
    unlock.disabled = false;
    erase.disabled = false;
  }
}
unlock.addEventListener(
  "click",
  () =>
    void action(async () => {
      const record = await read();
      if (!record) {
        note("No saved encrypted draft on this device.");
        return;
      }
      if (!secret.value) {
        note("Enter your draft passphrase.");
        return;
      }
      editor.value = await decrypt(record, secret.value);
      note(
        "Draft unlocked. Changes are saved only when you press Save encrypted draft.",
      );
    }),
);
save.addEventListener(
  "click",
  () =>
    void action(async () => {
      const phrase = secret.value;
      if (phrase.length < 12) {
        note("Use a passphrase of at least 12 characters.");
        return;
      }
      if (!editor.value.trim() || editor.value.length > 50000) {
        note("Write a draft of up to 50,000 characters first.");
        return;
      }
      const previous = await read();
      if (previous) await decrypt(previous, phrase); // Refuse to overwrite with the wrong passphrase.
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const secretKey = await key(phrase, salt);
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        secretKey,
        enc.encode(editor.value),
      );
      await write({
        salt: Array.from(salt),
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(ciphertext)),
        updatedAt: Date.now(),
      });
      secret.value = "";
      note(
        "Draft encrypted and saved only on this device. Keep your passphrase; it cannot be recovered.",
      );
      const reg = await navigator.serviceWorker?.ready.catch(() => null);
      if (reg && "sync" in reg) {
        try {
          await reg.sync.register("creators-draft-check");
        } catch {
          /* optional */
        }
      }
    }),
);
erase.addEventListener(
  "click",
  () =>
    void action(async () => {
      if (
        !window.confirm(
          "Permanently delete the encrypted offline draft on this device?",
        )
      )
        return;
      await remove();
      editor.value = "";
      secret.value = "";
      note("Encrypted draft deleted from this device.");
    }),
);
