"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

import { cn } from "@/lib/utils";

type OrganizationOption = {
  id: string;
  name: string;
  slug: string;
};

export function OrganizationSwitcher({
  activeOrganizationId,
  organizations,
  className,
}: {
  activeOrganizationId: string;
  organizations: OrganizationOption[];
  className?: string;
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
      className={cn(
        "max-w-36 rounded-xl border border-input bg-card px-3 py-2 text-xs font-semibold text-foreground/90 shadow-xs outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/[0.07] disabled:opacity-60 sm:max-w-52",
        className,
      )}
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
