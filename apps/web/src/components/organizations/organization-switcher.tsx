"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

type OrganizationOption = {
  id: string;
  name: string;
  slug: string;
};

export function OrganizationSwitcher({
  activeOrganizationId,
  organizations,
}: {
  activeOrganizationId: string;
  organizations: OrganizationOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function selectOrganization(event: ChangeEvent<HTMLSelectElement>) {
    setPending(true);
    const response = await fetch("/api/organizations/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: event.target.value }),
    });
    const result = (await response.json()) as { workspacePath?: string };

    if (response.ok && result.workspacePath) {
      router.push(result.workspacePath as Route);
      router.refresh();
      return;
    }

    setPending(false);
  }

  return (
    <select
      aria-label="Active organization"
      className="max-w-52 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white outline-none focus:border-cyan-300/50 disabled:opacity-60"
      value={activeOrganizationId}
      disabled={pending}
      onChange={selectOrganization}
    >
      {organizations.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
        </option>
      ))}
    </select>
  );
}
