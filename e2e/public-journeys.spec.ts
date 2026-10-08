import { expect, test } from "@playwright/test";

test("public navigation remains usable without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /from first thought.*final media/i }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto("/design-system");
  await expect(
    page.getByRole("heading", { name: /ideas begin in pencil/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /return to platform/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("sign-in is keyboard reachable and CSP permits local blob audio", async ({
  page,
}) => {
  const response = await page.goto("/sign-in");
  expect(response?.headers()["content-security-policy"]).toContain(
    "media-src 'self' blob:",
  );
  const email = page.getByLabel(/email/i);
  const password = page.getByLabel(/password/i);
  await email.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();

  const mediaResult = await page.evaluate(async () => {
    const sampleRate = 8_000;
    const samples = sampleRate / 10;
    const bytes = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(bytes);
    const write = (offset: number, value: string) =>
      [...value].forEach((character, index) =>
        view.setUint8(offset + index, character.charCodeAt(0)),
      );
    write(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples * 2, true);
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    try {
      const audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener("loadedmetadata", () => resolve(), {
          once: true,
        });
        audio.addEventListener(
          "error",
          () => reject(new Error("audio error")),
          {
            once: true,
          },
        );
        audio.load();
      });
      return { duration: audio.duration, source: audio.currentSrc };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  expect(mediaResult.source).toMatch(/^blob:/);
  expect(mediaResult.duration).toBeGreaterThan(0);
});
