import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test.describe("Learn publishing", () => {
  test.skip(
    process.env.LEARN_E2E !== "true",
    "Needs the isolated Learn database fixtures",
  );
  test("public archive and article work in both themes without exposing drafts", async ({
    page,
    request,
  }, info) => {
    await page.goto("/learn");
    await expect(
      page.getByRole("heading", { name: /a good idea/i }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: /a little direction/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A little direction. A remarkable image.",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/learn\/learn-e2e-guide$/,
    );
    await expect(
      page.getByRole("navigation", { name: "Table of contents" }),
    ).toContainText("Shape the light");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `test-results/learn-article-${info.project.name}-${theme}.png`,
        fullPage: true,
      });
    }
    expect((await request.get("/learn/learn-e2e-draft")).status()).toBe(404);
    expect(
      (await request.get("/api/admin/learn/learn-e2e-draft")).status(),
    ).toBe(403);
    expect(
      (await request.post("/api/admin/learn", { data: {} })).status(),
    ).toBe(403);
    await page.goto("/learn");
    await page.screenshot({
      path: `test-results/learn-archive-${info.project.name}.png`,
      fullPage: true,
    });
  });
  test("classic editor saves, uploads, previews and publishes a real article", async ({
    page,
    context,
    request,
  }, info) => {
    const token = `learn-e2e-${info.project.name}`;
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
    await page.goto("/admin/learn/new");
    await expect(
      page.getByRole("heading", { name: "Write something useful." }),
    ).toBeVisible();
    const unique = `guide-${info.project.name}-${Date.now()}`;
    await page.getByLabel("Article title").fill("A practical image guide");
    await page.getByLabel("Permalink: /learn/").fill(unique);
    await page
      .getByLabel("Article body")
      .fill(
        "This is a practical guide with enough detail to explain a creative workflow, help readers make informed choices, and produce a useful result.",
      );
    await page
      .getByLabel("Article excerpt")
      .fill("A clear starting point for your next image.");
    await page.getByRole("button", { name: "Add media", exact: true }).click();
    await page
      .getByLabel("Image description / alt text")
      .fill("An example cover image");
    await page.getByLabel(/Upload image, video or audio/).setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAaElEQVRYhe2SQQkAQRDDqvPkVEmkrof7hIFCBKSh6cdpoht0A9ArdhfiLtENugHoFbsLcZfoBt0A9IrdhbhLdINuAHrF7kLcJbpBNwC9Ynch7hLdoBuAXrG7EHeJbtANQK/YXQg95G8eJRBcxHheItAAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      page.getByRole("button", { name: "Use as cover" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Use as cover" }).first().click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved successfully");
    expect((await request.get(`/learn/${unique}`)).status()).toBe(404);
    await page.screenshot({
      path: `test-results/learn-editor-${info.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Published successfully",
    );
    await page.goto(`/learn/${unique}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A practical image guide",
    );
    await expect(
      page.getByRole("img", { name: "An example cover image" }),
    ).toBeVisible();
  });
});
