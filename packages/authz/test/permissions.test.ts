import { describe, expect, it } from "vitest";

import {
  getOrganizationPermissions,
  getPlatformPermissions,
  hasOrganizationPermission,
  hasPlatformPermission,
  organizationPermissions,
  platformPermissions,
} from "../src/index";

describe("platform RBAC", () => {
  it("gives the platform owner every platform permission", () => {
    expect(getPlatformPermissions("PLATFORM_OWNER")).toEqual(
      platformPermissions,
    );
  });

  it("keeps financial mutations away from support and platform admins", () => {
    expect(hasPlatformPermission("SUPPORT", "credits:grant")).toBe(false);
    expect(hasPlatformPermission("PLATFORM_ADMIN", "payments:manage")).toBe(
      false,
    );
    expect(hasPlatformPermission("FINANCE_ADMIN", "credits:grant")).toBe(true);
  });

  it("does not grant platform-console access to customer users", () => {
    expect(hasPlatformPermission("USER", "platform:access")).toBe(false);
  });

  it("reserves forced ownership transfer for the platform owner", () => {
    expect(
      hasPlatformPermission(
        "PLATFORM_ADMIN",
        "organizations:transfer-ownership",
      ),
    ).toBe(false);
    expect(
      hasPlatformPermission(
        "PLATFORM_OWNER",
        "organizations:transfer-ownership",
      ),
    ).toBe(true);
  });
});

describe("organization RBAC", () => {
  it("gives organization owners every organization permission", () => {
    expect(getOrganizationPermissions("ORGANIZATION_OWNER")).toEqual(
      organizationPermissions,
    );
  });

  it("allows members to generate without allowing membership changes", () => {
    expect(
      hasOrganizationPermission("ORGANIZATION_MEMBER", "generation:create"),
    ).toBe(true);
    expect(
      hasOrganizationPermission("ORGANIZATION_MEMBER", "members:manage"),
    ).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(
      hasOrganizationPermission("ORGANIZATION_VIEWER", "assets:read"),
    ).toBe(true);
    expect(
      hasOrganizationPermission("ORGANIZATION_VIEWER", "generation:create"),
    ).toBe(false);
  });

  it("reserves organization ownership transfer for owners", () => {
    expect(
      hasOrganizationPermission(
        "ORGANIZATION_MEMBER",
        "organization:transfer-ownership",
      ),
    ).toBe(false);
    expect(
      hasOrganizationPermission(
        "ORGANIZATION_OWNER",
        "organization:transfer-ownership",
      ),
    ).toBe(true);
  });
});
