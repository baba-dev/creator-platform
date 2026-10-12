import { expect, test } from "@playwright/test";

test("public pricing stays readable at mobile, tablet and desktop sizes", async ({
  page,
}) => {
  const response = await page.goto("/pricing");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: /create anything.*know what it costs/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Chat & reasoning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Image generation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Media tools" }),
  ).toBeVisible();

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(
      overflow,
      "Unexpected horizontal overflow at " + width + "px",
    ).toBeLessThanOrEqual(1);
  }

  await page.getByRole("link", { name: /estimate a creation/i }).click();
  await expect(page).toHaveURL(/#calculator$/);
  await expect(
    page.getByRole("heading", { name: "Quick estimate" }),
  ).toBeVisible();
});

test("public pricing theme and filters work without authentication", async ({
  page,
}) => {
  await page.goto("/pricing");
  const initial = await page.locator("html").getAttribute("data-theme");
  await page
    .getByRole("button", { name: /switch to (light|dark) theme/i })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    initial === "light" ? "dark" : "light",
  );
  await page
    .getByRole("searchbox", { name: /search models or capabilities/i })
    .fill("unlikely-pricing-search-result");
  await expect(
    page.getByText(/No matching published entries/).first(),
  ).toBeVisible();
});
