import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  endpointFingerprint,
  encryptPushPayload,
  validatePushEndpoint,
  vapidPublicKey,
} from "../src/web-push";

describe("PWA push cryptography and endpoint policy", () => {
  it("rejects SSRF endpoints and redirects to arbitrary hosts", () => {
    for (const url of [
      "http://fcm.googleapis.com/send",
      "https://127.0.0.1/push",
      "https://evil.example/push",
      "https://fcm.googleapis.com.evil.example/send",
      "https://user:password@fcm.googleapis.com/send",
      "https://fcm.googleapis.com:8443/send",
    ]) {
      expect(() => validatePushEndpoint(url)).toThrow();
    }
    expect(
      validatePushEndpoint("https://fcm.googleapis.com/fcm/send/example")
        .hostname,
    ).toBe("fcm.googleapis.com");
  });
  it("derives stable public and endpoint fingerprints", () => {
    const key = randomBytes(32).toString("base64url");
    expect(Buffer.from(vapidPublicKey(key), "base64url")).toHaveLength(65);
    expect(endpointFingerprint("test")).toHaveLength(64);
  });
  it("encrypts a bounded aes128gcm record with a fresh ephemeral key", () => {
    const receiver = createECDH("prime256v1");
    const p256dh = receiver.generateKeys().toString("base64url");
    const keys = { p256dh, auth: randomBytes(16).toString("base64url") };
    const record = encryptPushPayload(JSON.stringify({ kind: "ready" }), keys);
    expect(record).toHaveLength(
      16 +
        4 +
        1 +
        65 +
        Buffer.byteLength(JSON.stringify({ kind: "ready" })) +
        1 +
        16,
    );
    expect(record.readUInt32BE(16)).toBe(4096);
    expect(record[20]).toBe(65);
    expect(
      encryptPushPayload("hello", keys).equals(
        encryptPushPayload("hello", keys),
      ),
    ).toBe(false);
    expect(() => encryptPushPayload("x".repeat(2049), keys)).toThrow();
  });
});
