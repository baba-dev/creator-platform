import assert from "node:assert/strict";
import { Script } from "node:vm";

const origin = process.argv[2];
if (!origin || !/^https:\/\//.test(origin)) {
  throw new Error("Usage: node ops/pwa/check-live.mjs https://your-app-domain");
}
const base = new URL(origin);
const get = async (path, agent = "Creators-PWA-Release-Check/1.0") => {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin);
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "User-Agent": agent, Accept: "*/*" },
    signal: AbortSignal.timeout(20_000),
  });
  const type = response.headers.get("content-type") || "";
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  assert.notEqual(response.headers.get("cf-mitigated"), "challenge", `${path}: Cloudflare challenge`);
  const body = Buffer.from(await response.arrayBuffer());
  assert(!body.subarray(0, 256).toString().toLowerCase().includes("just a moment"), `${path}: challenge HTML`);
  return { response, body, type };
};
const html = await get("/");
assert(html.type.includes("text/html"), "Root page must serve HTML");
const homepage = html.body.toString();
assert(homepage.includes("/manifest.webmanifest"), "Manifest link missing from public HTML");
assert(homepage.includes("/pwa-register.js"), "Hydration-independent worker registration missing");
const worker = await get("/sw.js");
assert(/javascript/.test(worker.type), "Worker MIME must be JavaScript");
assert((worker.response.headers.get("cache-control") || "").includes("no-store"), "Service Worker must bypass caches");
assert.equal(worker.response.headers.get("service-worker-allowed"), "/", "Incorrect Service Worker scope header");
new Script(worker.body.toString(), { filename: "/sw.js" });
assert(worker.body.toString().includes('addEventListener("activate"'), "Activation listener missing");
const entry = await get("/pwa-register.js");
assert(/javascript/.test(entry.type), "Registration entry MIME must be JavaScript");
new Script(entry.body.toString(), { filename: "/pwa-register.js" });
const manifestReply = await get("/manifest.webmanifest");
assert(/json|manifest/.test(manifestReply.type), "Manifest MIME must be JSON");
const manifest = JSON.parse(manifestReply.body.toString());
assert.equal(manifest.id, "/");
assert.equal(manifest.scope, "/");
assert(new URL(manifest.start_url, base).origin === base.origin);
assert(manifest.icons?.some((i) => i.purpose.split(" ").includes("any") && i.sizes.includes("192x192")));
assert(manifest.icons?.some((i) => i.purpose.split(" ").includes("maskable") && i.sizes.includes("512x512")));
assert(manifest.screenshots?.some((s) => s.form_factor === "wide"));
assert(manifest.screenshots?.some((s) => s.form_factor === "narrow"));
for (const path of ["/offline.html", "/offline-guide.html"]) {
  assert((await get(path)).type.includes("text/html"), `${path}: expected HTML`);
}
assert(/javascript/.test((await get("/offline-drafts.js")).type));
for (const icon of manifest.icons) {
  const asset = await get(icon.src);
  if (icon.type === "image/webp") {
    assert(asset.type.includes("image/webp"), `${icon.src}: expected WebP`);
    assert.equal(asset.body.subarray(0, 4).toString(), "RIFF", `${icon.src}: invalid image`);
    assert.equal(asset.body.subarray(8, 12).toString(), "WEBP", `${icon.src}: invalid image`);
  } else if (icon.type === "image/png") {
    assert(asset.type.includes("image/png"), `${icon.src}: expected PNG`);
    assert.equal(asset.body.subarray(1, 4).toString(), "PNG", `${icon.src}: invalid image`);
  }
}
for (const shot of manifest.screenshots) {
  const asset = await get(shot.src);
  assert(asset.type.includes("image/png"), `${shot.src}: expected PNG`);
  assert.equal(asset.body.subarray(1, 4).toString(), "PNG", `${shot.src}: invalid screenshot`);
  assert.equal(`${asset.body.readUInt32BE(16)}x${asset.body.readUInt32BE(20)}`, shot.sizes, `${shot.src}: mismatched screenshot size`);
}
// This secondary request is diagnostic. Scanner-specific bot rules are managed
// in Cloudflare, not bypassed by weakening application/API security.
try {
  for (const path of ["/", "/sw.js", "/manifest.webmanifest"]) {
    await get(path, "PWABuilderHttpAgent Creators-Release-Check/1.0");
  }
  console.log("PWABuilder-style user agent: public paths accessible");
} catch (error) {
  console.warn("Warning: PWABuilder-style request blocked or unavailable:", error.message);
  console.warn("Inspect Cloudflare WAF events and scope any exemption only to the public PWA assets.");
}
console.log("PASS: deployed PWA HTML, worker, registration, manifest, offline files, icons, and screenshots");
