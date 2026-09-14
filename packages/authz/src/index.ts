export const platformRoles = [
  "USER",
  "SUPPORT",
  "OPERATOR",
  "FINANCE_ADMIN",
  "PLATFORM_ADMIN",
  "PLATFORM_OWNER",
] as const;

export type PlatformRole = (typeof platformRoles)[number];

export const platformPermissions = [
  "platform:access",
  "users:read",
  "users:manage",
  "organizations:read",
  "organizations:manage",
  "payments:read",
  "payments:manage",
  "credits:grant",
  "models:read",
  "models:manage",
  "jobs:read",
  "jobs:manage",
  "audit:read",
] as const;

export type PlatformPermission = (typeof platformPermissions)[number];

const platformRolePermissions = {
  USER: [],
  SUPPORT: ["platform:access", "users:read", "organizations:read", "jobs:read"],
  OPERATOR: [
    "platform:access",
    "organizations:read",
    "models:read",
    "jobs:read",
    "jobs:manage",
  ],
  FINANCE_ADMIN: [
    "platform:access",
    "organizations:read",
    "payments:read",
    "payments:manage",
    "credits:grant",
    "audit:read",
  ],
  PLATFORM_ADMIN: [
    "platform:access",
    "users:read",
    "users:manage",
    "organizations:read",
    "organizations:manage",
    "payments:read",
    "models:read",
    "models:manage",
    "jobs:read",
    "jobs:manage",
    "audit:read",
  ],
  PLATFORM_OWNER: platformPermissions,
} as const satisfies Record<PlatformRole, readonly PlatformPermission[]>;

export function hasPlatformPermission(
  role: PlatformRole,
  permission: PlatformPermission,
): boolean {
  return platformRolePermissions[role].includes(permission as never);
}

export function getPlatformPermissions(
  role: PlatformRole,
): readonly PlatformPermission[] {
  return platformRolePermissions[role];
}

export const organizationRoles = [
  "ORGANIZATION_OWNER",
  "ORGANIZATION_MEMBER",
  "ORGANIZATION_VIEWER",
] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export const organizationPermissions = [
  "workspace:view",
  "projects:read",
  "projects:write",
  "assets:read",
  "assets:manage",
  "generation:create",
  "generation:cancel",
  "usage:read",
  "members:read",
  "members:manage",
  "organization:manage",
] as const;

export type OrganizationPermission = (typeof organizationPermissions)[number];

const organizationRolePermissions = {
  ORGANIZATION_VIEWER: [
    "workspace:view",
    "projects:read",
    "assets:read",
    "usage:read",
  ],
  ORGANIZATION_MEMBER: [
    "workspace:view",
    "projects:read",
    "projects:write",
    "assets:read",
    "assets:manage",
    "generation:create",
    "generation:cancel",
    "usage:read",
    "members:read",
  ],
  ORGANIZATION_OWNER: organizationPermissions,
} as const satisfies Record<
  OrganizationRole,
  readonly OrganizationPermission[]
>;

export function hasOrganizationPermission(
  role: OrganizationRole,
  permission: OrganizationPermission,
): boolean {
  return organizationRolePermissions[role].includes(permission as never);
}

export function getOrganizationPermissions(
  role: OrganizationRole,
): readonly OrganizationPermission[] {
  return organizationRolePermissions[role];
}
