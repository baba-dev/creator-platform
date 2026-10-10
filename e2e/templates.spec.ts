import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
test.describe("Templates 2.0", () => {
  test.skip(process.env.LEARN_E2E !== "true", "Needs isolated local fixtures");
  test("renders 25 distinctive covers and opens the existing Studio directly", async ({
    page,
    context,
    request,
  }) => {
    const token = `learn-e2e-${test.info().project.name}`;
    const signature = createHmac("sha256", process.env.AUTH_SECRET!)
      .update(token)
      .digest("base64");
    await context.addCookies([
      {
        name: "aiwa-creators.session_token",
        value: encodeURIComponent(`${token}.${signature}`),
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/app/learn-e2e/templates");
    await expect(page.getByText("25 creative recipes")).toBeVisible();
    const covers = page.locator("main article img");
    await expect(covers.first()).toBeVisible();
    expect(await covers.count()).toBeGreaterThanOrEqual(25);
    const first = page
      .getByRole("link", { name: "Use YouTube Thumbnail template" })
      .first();
    await first.click();
    await expect(page).toHaveURL(
      /\/app\/learn-e2e(?:\?template=youtube-thumbnail)?#create/,
    );
    await expect(
      page.getByRole("heading", { name: "YouTube Thumbnail", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Video topic")).toBeVisible();
    await expect(page.getByText("Template selected")).toBeVisible();
    await expect(
      page.getByText("Complete the required details to prepare this template."),
    ).toBeVisible();
    expect(
      (
        await request.get(
          "/api/templates/youtube-thumbnail?organizationId=wrong",
        )
      ).status(),
    ).toBe(400);
    await page.screenshot({
      path: `test-results/templates-direct-${test.info().project.name}.png`,
      fullPage: true,
    });
  });
});
