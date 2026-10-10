"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

type Workspace = { id: string; name: string; slug: string };
type Pending = {
  id: string; file: File | null; title: string; body: string;
  sharedUrl: string; createdAt: number;
};
type LaunchWindow = Window & {
  launchQueue?: { setConsumer: (cb: (params: { files: Array<{ getFile(): Promise<File> }> }) => void) => void };
};

function inboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("creators-pwa-incoming", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("pending"))
        request.result.createObjectStore("pending", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function consume(id: string): Promise<Pending | null> {
  const db = await inboxDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("pending", "readwrite");
      const store = transaction.objectStore("pending");
      let item: Pending | null = null;
      const read = store.get(id);
      read.onsuccess = () => {
        item = read.result || null;
        store.delete(id);
      };
      transaction.oncomplete = () => resolve(item && Date.now() - item.createdAt <= 15 * 60_000 ? item : null);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export function PwaInbox({ workspaces }: { workspaces: Workspace[] }) {
  const [incoming, setIncoming] = useState<Pending | null>(null);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [assetId, setAssetId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("import");
    if (id && /^[0-9a-f-]{36}$/.test(id)) {
      void consume(id).then((item) => setIncoming(item)).catch(() => setResult("Unable to read the device inbox."));
      window.history.replaceState(null, "", "/pwa/inbox");
    } else if (params.get("error") === "share") setResult("The share could not be accepted. Use a supported file under 25 MB or share text.");
    (window as LaunchWindow).launchQueue?.setConsumer(async (params) => {
      try {
        const handle = params.files?.[0];
        if (!handle) return;
        const file = await handle.getFile();
        if (file.size > 25 * 1024 * 1024) { setResult("This file exceeds the 25 MB device inbox limit."); return; }
        if (!["image/png", "image/jpeg", "image/webp", "video/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"].includes(file.type)) {
          setResult("This file format is not supported."); return;
        }
        setIncoming({ id: crypto.randomUUID(), file, title: "", body: "", sharedUrl: "", createdAt: Date.now() });
      } catch { setResult("The device could not open that file."); }
    });
  }, []);

  const workspace = workspaces.find((item) => item.id === workspaceId);
  async function upload() {
    if (!incoming?.file || !workspace) return;
    setBusy(true); setResult("");
    try {
      const form = new FormData();
      form.set("file", incoming.file);
      form.set("organizationId", workspace.id);
      const response = await fetch("/api/assets/upload", { method: "POST", body: form, credentials: "same-origin" });
      const json = await response.json() as { asset?: { id?: string }; error?: string };
      if (!response.ok || !json.asset?.id) throw new Error(json.error || "Upload failed.");
      setAssetId(json.asset.id); setResult("Saved to your selected workspace.");
    } catch (error) { setResult(error instanceof Error ? error.message : "Unable to upload the media."); }
    finally { setBusy(false); }
  }

  return <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
    <div className="flex items-center gap-3"><Icon name="upload" className="size-7 text-primary" /><h2 className="font-display text-xl font-semibold">Incoming content</h2></div>
    {!incoming ? <p className="mt-4 text-sm text-muted-foreground">Nothing is waiting. Use your operating system's Share or Open with menu to send compatible content here.</p> : <>
      {incoming.file && <div className="mt-5 rounded-2xl border border-border bg-surface-sunken p-4">
        <p className="font-semibold break-all">{incoming.file.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{incoming.file.type || "Unknown type"} · {(incoming.file.size / 1024 / 1024).toFixed(1)} MB</p>
      </div>}
      {(incoming.title || incoming.body || incoming.sharedUrl) && <label className="mt-5 block text-xs font-semibold">Shared text
        <textarea readOnly rows={5} className="mt-2 w-full resize-y rounded-xl border border-border bg-surface-sunken p-3 text-sm text-foreground" value={[incoming.title, incoming.body, incoming.sharedUrl].filter(Boolean).join("\n")} />
      </label>}
      {incoming.file && <div className="mt-5">
        <label htmlFor="pwa-import-workspace" className="text-xs font-semibold">Save into workspace</label>
        <select id="pwa-import-workspace" className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
          {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button type="button" disabled={!workspace || busy || Boolean(assetId)} onClick={() => void upload()} className="mt-4 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Importing…" : assetId ? "Imported" : "Import media"}</button>
      </div>}
      {assetId && workspace && <a className="ml-3 text-sm font-semibold text-primary hover:underline" href={`/app/${workspace.slug}/assets`}>Open Asset Library →</a>}
      {!incoming.file && <button type="button" className="mt-4 rounded-xl border border-border p-3 text-xs font-semibold" onClick={() => void navigator.clipboard.writeText([incoming.title, incoming.body, incoming.sharedUrl].filter(Boolean).join("\n"))}>Copy shared text</button>}
    </>}
    {result && <p role="status" className="mt-4 text-xs text-muted-foreground">{result}</p>}
    <p className="mt-6 text-xs leading-5 text-muted-foreground">Shared files are held locally for at most 15 minutes until reviewed. The import uses your existing authenticated, validated asset upload workflow.</p>
  </section>;
}
