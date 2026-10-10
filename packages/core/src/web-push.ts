import {
  createCipheriv,
  createECDH,
  createHash,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from "node:crypto";

export type WebPushKeys = { p256dh: string; auth: string };
export type WebPushResult = "delivered" | "gone";

const exactHosts = new Set([
  "fcm.googleapis.com",
  "fcm-xm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
]);
const permittedSuffixes = [
  ".push.apple.com",
  ".notify.windows.com",
  ".wns.windows.com",
];

export function validatePushEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash ||
    (!exactHosts.has(url.hostname) &&
      !permittedSuffixes.some((suffix) => url.hostname.endsWith(suffix)))
  )
    throw new Error("Unsupported push endpoint host.");
  return url;
}

export function endpointFingerprint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function vapidKey(privateKey: string) {
  const privateBytes = Buffer.from(privateKey, "base64url");
  if (privateBytes.length !== 32) throw new Error("Invalid VAPID private key.");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);
  const publicBytes = ecdh.getPublicKey(undefined, "uncompressed");
  return { privateBytes, publicBytes };
}

export function vapidPublicKey(privateKey: string): string {
  return vapidKey(privateKey).publicBytes.toString("base64url");
}

function tokenFor(
  endpoint: URL,
  privateKey: Buffer,
  publicBytes: Buffer,
  subject: string,
): string {
  if (
    !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject) &&
    !/^https:\/\/[^\s]+$/.test(subject)
  )
    throw new Error("Invalid VAPID subject.");
  const encoded = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const input =
    encoded({ typ: "JWT", alg: "ES256" }) +
    "." +
    encoded({
      aud: endpoint.origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: subject,
    });
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
      d: privateKey.toString("base64url"),
    },
    format: "jwk",
  });
  return (
    input +
    "." +
    sign("sha256", Buffer.from(input), {
      key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url")
  );
}

export function encryptPushPayload(payload: string, keys: WebPushKeys): Buffer {
  const uaPublic = Buffer.from(keys.p256dh, "base64url");
  const authSecret = Buffer.from(keys.auth, "base64url");
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) {
    throw new Error("Invalid push encryption keys.");
  }
  if (Buffer.byteLength(payload, "utf8") > 2048)
    throw new Error("Push payload too large.");
  const server = createECDH("prime256v1");
  const serverPublic = server.generateKeys();
  const shared = server.computeSecret(uaPublic);
  const salt = randomBytes(16);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    uaPublic,
    serverPublic,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, info, 32));
  const cek = Buffer.from(
    hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0"),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublic.length]),
    serverPublic,
    encrypted,
  ]);
}

export async function deliverWebPush(input: {
  endpoint: string;
  keys: WebPushKeys;
  vapidPrivateKey: string;
  vapidSubject: string;
  payload: string;
}): Promise<WebPushResult> {
  const endpoint = validatePushEndpoint(input.endpoint);
  const { privateBytes, publicBytes } = vapidKey(input.vapidPrivateKey);
  const token = tokenFor(
    endpoint,
    privateBytes,
    publicBytes,
    input.vapidSubject,
  );
  const body = encryptPushPayload(input.payload, input.keys);
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      Authorization:
        "vapid t=" + token + ", k=" + publicBytes.toString("base64url"),
      TTL: "43200",
      Urgency: "normal",
    },
    body: new Uint8Array(body),
  });
  if (response.status === 404 || response.status === 410) return "gone";
  if (response.status !== 201 && response.status !== 202)
    throw new Error("Push delivery rejected (" + response.status + ").");
  return "delivered";
}
