import { expect, test } from "@playwright/test";

test("public tools directory remains usable at mobile, tablet and desktop widths", async ({
  page,
}) => {
  const response = await page.goto("/tools");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      name: /every creative tool.*one connected workspace/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find a tool for the job." }),
  ).toBeVisible();
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(
      overflow,
      "Unexpected overflow at " + width + "px",
    ).toBeLessThanOrEqual(1);
  }
});

test("search, filters and rule-based tool finder are accessible without login", async ({
  page,
}) => {
  await page.goto("/tools");
  await page
    .getByRole("searchbox", { name: "Search creative tools" })
    .fill("transcription");
  await expect(
    page
      .locator("#directory")
      .getByRole("heading", { name: "Speech / Transcription" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Image & Design" }).click();
  await expect(page.getByText("No matching tools yet.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Make a video" }).click();
  await page.getByRole("button", { name: "An image", exact: true }).click();
  await expect(
    page.locator("#tool-finder").getByText("Video Studio", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#tool-finder").getByRole("link", { name: "Compare pricing" }),
  ).toBeVisible();
});

test("public tool detail keeps signup destination allowlisted", async ({
  page,
}) => {
  const response = await page.goto("/tools/ai-image-generator");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      name: "Turn the picture in your head into a visual you can actually use.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Compare models & pricing" }).first(),
  ).toHaveAttribute("href", "/pricing");
  await page.getByRole("link", { name: "Start creating" }).last().click();
  await expect(page).toHaveURL(/\/tools\/start\/image-studio$/);
  await expect(
    page.getByRole("heading", { name: "Continue to Image Studio." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create an account" }),
  ).toHaveAttribute(
    "href",
    "/sign-up?returnTo=%2Ftools%2Fstart%2Fimage-studio",
  );
});
