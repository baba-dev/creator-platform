import { expect, test } from "@playwright/test";

test("PWA manifest advertises only same-origin workspace launch destinations", async ({
  page,
}) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const data = (await manifest.json()) as {
    id: string;
    start_url: string;
    scope: string;
    icons: { purpose: string; sizes: string }[];
    shortcuts: { url: string }[];
    share_target: { action: string; method: string };
  };
  expect(data.id).toBe("/");
  expect(data.scope).toBe("/");
  expect(data.start_url).toBe("/app?source=pwa");
  expect(
    data.icons.some(
      (icon) => icon.purpose === "maskable" && icon.sizes === "512x512",
    ),
  ).toBeTruthy();
  expect(data.shortcuts).toHaveLength(4);
  for (const item of data.shortcuts)
    expect(item.url.startsWith("/")).toBeTruthy();
  expect(data.share_target.action).toBe("/pwa/inbox");
  expect(data.share_target.method).toBe("POST");
});

test("offline navigation returns the public fallback without caching private workspace HTML", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      await navigator.serviceWorker.ready;
      return Boolean(navigator.serviceWorker.controller);
    },
    null,
    { timeout: 20000 },
  );
  await context.setOffline(true);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Ideas can keep flowing." }),
  ).toBeVisible();
  const cachePaths = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys())
        urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cachePaths).not.toContain("/app");
  expect(cachePaths).not.toContain("/api/health");
});

test("offline scratchpad stores ciphertext and can be unlocked without network", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    async () => {
      await navigator.serviceWorker.ready;
      return Boolean(navigator.serviceWorker.controller);
    },
    null,
    { timeout: 20000 },
  );
  await context.setOffline(true);
  await page.goto("/app");
  await page.locator("#pad-text").fill("A private offline campaign idea");
  await page.locator("#pad-passphrase").fill("a-long-test-passphrase");
  await page.getByRole("button", { name: "Save encrypted draft" }).click();
  await expect(page.locator("#pad-status")).toContainText(
    "encrypted and saved",
  );
  const stored = await page.evaluate(
    async () =>
      await new Promise<{ text: string; salt: number[] } | null>(
        (resolve, reject) => {
          const request = indexedDB.open("creators-offline-pad-v1", 1);
          request.onsuccess = () => {
            const tx = request.result.transaction("notes", "readonly");
            const r = tx.objectStore("notes").get("scratchpad");
            r.onsuccess = () =>
              resolve(
                r.result
                  ? { text: JSON.stringify(r.result), salt: r.result.salt }
                  : null,
              );
            r.onerror = () => reject(r.error);
          };
          request.onerror = () => reject(request.error);
        },
      ),
  );
  expect(stored?.text).not.toContain("private offline campaign idea");
  expect(stored?.salt).toHaveLength(16);
  await page.reload();
  await page.locator("#pad-passphrase").fill("a-long-test-passphrase");
  await page.getByRole("button", { name: "Unlock saved draft" }).click();
  await expect(page.locator("#pad-text")).toHaveValue(
    "A private offline campaign idea",
  );
});

test("capture actual responsive public Creators app artwork for manifest review", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /from first thought.*final media/i }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path:
      testInfo.project.name === "desktop-chromium"
        ? "test-results/pwa-wide.png"
        : "test-results/pwa-narrow.png",
    animations: "disabled",
    fullPage: false,
  });
});
