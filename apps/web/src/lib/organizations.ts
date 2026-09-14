export function normalizeOrganizationSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

  return slug || "workspace";
}

export function createOrganizationSlug(
  name: string,
  suffix = crypto.randomUUID().slice(0, 8),
): string {
  return `${normalizeOrganizationSlug(name)}-${suffix.toLowerCase()}`;
}
