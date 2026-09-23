import { describe, expect, it } from "vitest";

import { safeInternalRoute } from "./navigation";

describe("safeInternalRoute", () => {
  it("keeps internal paths and query strings", () => {
    expect(safeInternalRoute("/app/client?tab=usage")).toBe(
      "/app/client?tab=usage",
    );
  });

  it.each([
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example/path",
  ])("rejects external return target %s", (target) => {
    expect(safeInternalRoute(target)).toBe("/app");
  });
});

import { safeInvitationRoute } from "./navigation";

describe("safeInvitationRoute", () => {
  it("preserves valid invitation continuation routes", () => {
    expect(safeInvitationRoute("/invite/abc123xyz")).toBe("/invite/abc123xyz");
    expect(
      safeInvitationRoute("/invite/tok_0123456789abcdef?ref=mail#section"),
    ).toBe("/invite/tok_0123456789abcdef?ref=mail#section");
  });

  it("defaults to /onboarding when no returnTo is provided", () => {
    expect(safeInvitationRoute(undefined)).toBe("/onboarding");
    expect(safeInvitationRoute("")).toBe("/onboarding");
  });

  it.each([
    "/invite/",
    "/invite/bad token!",
    "/invite/token with spaces",
    "/invite/token/subpath",
    "/sign-in",
    "/sign-up",
    "/api/generations",
    "https://evil.com/invite/123",
    "//evil.com/invite/123",
  ])(
    "rejects invalid invitation target %s and falls back to /onboarding",
    (target) => {
      expect(safeInvitationRoute(target)).toBe("/onboarding");
    },
  );

  it("allows safe internal application routes", () => {
    expect(safeInvitationRoute("/app/acme-org")).toBe("/app/acme-org");
  });
});
