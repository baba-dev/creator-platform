import { expect, test } from "@playwright/test";

test("public solutions index and all audience pages are discoverable", async ({
  page,
}) => {
  await page.goto("/solutions");
  await expect(
    page.getByRole("heading", { level: 1, name: /one creative platform/i }),
  ).toBeVisible();
  const slugs = [
    "marketing-agencies",
    "ecommerce",
    "social-media-creators",
    "businesses",
    "production-teams",
  ];
  for (const slug of slugs) {
    const response = await page.goto("/solutions/" + slug);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /connected creative workflow/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /explore pricing/i }).first(),
    ).toHaveAttribute("href", "/pricing");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("guided public finder recommends real routes without a generation request", async ({
  page,
}) => {
  const jobs: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/generation-jobs") ||
      request.url().includes("/api/quotes")
    )
      jobs.push(request.url());
  });
  await page.goto("/solutions");
  await page.getByRole("button", { name: "E-commerce & retail" }).click();
  await page.getByRole("button", { name: "Create product visuals" }).click();
  await page.getByRole("button", { name: "Understanding the costs" }).click();
  await page.getByRole("button", { name: /find my workflow/i }).click();
  await expect(
    page.getByRole("heading", { name: "E-commerce & retail" }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /view full solution/i }),
  ).toHaveAttribute("href", "/solutions/ecommerce");
  await expect(
    page.getByRole("link", { name: /start this workflow/i }),
  ).toHaveAttribute("href", "/tools/start/image-studio");
  expect(jobs).toEqual([]);
});

test("public solutions remains usable at narrow mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/solutions");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.goto("/solutions/ecommerce");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
