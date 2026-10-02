import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "../src/crypto";

describe("crypto encryption utility", () => {
  const secretKey = "sample-secret-key-1234567890123456";

  it("encrypts and decrypts string payloads cleanly", () => {
    const original = "my-oauth-refresh-token-12345";
    const encrypted = encryptSecret(original, secretKey);

    expect(encrypted).not.toBe(original);
    expect(encrypted.split(".").length).toBe(3);

    const decrypted = decryptSecret(encrypted, secretKey);
    expect(decrypted).toBe(original);
  });

  it("produces distinct ciphertexts for identical inputs due to random IV", () => {
    const payload = "token-abc";
    const enc1 = encryptSecret(payload, secretKey);
    const enc2 = encryptSecret(payload, secretKey);

    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1, secretKey)).toBe(payload);
    expect(decryptSecret(enc2, secretKey)).toBe(payload);
  });

  it("fails decryption if auth tag or ciphertext is tampered", () => {
    const encrypted = encryptSecret("sensitive-value", secretKey);
    const parts = encrypted.split(".");
    expect(parts.length).toBe(3);
    const [iv, authTag, ciphertext] = parts as [string, string, string];
    const tamperedAuthTag =
      (authTag.startsWith("A") ? "B" : "A") + authTag.slice(1);
    const tampered = `${iv}.${tamperedAuthTag}.${ciphertext}`;

    expect(() => decryptSecret(tampered, secretKey)).toThrow();
  });

  it("fails decryption if wrong key is provided", () => {
    const encrypted = encryptSecret("secret-value", secretKey);
    expect(() => decryptSecret(encrypted, "wrong-key")).toThrow();
  });
});
