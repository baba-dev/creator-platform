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
      className="max-w-36 rounded-xl border border-white/[0.08] bg-[#0d111c] px-3 py-2 text-xs font-semibold text-slate-300 outline-none transition focus:border-violet-300/40 disabled:opacity-60 sm:max-w-52"
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
