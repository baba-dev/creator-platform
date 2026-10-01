import Link from "next/link";
import type { Route } from "next";

import { AdminCreateUserForm } from "@/components/admin/user-credential-forms";
import { Eyebrow } from "@/components/ui/creative";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function AdminCreateUserPage() {
  const session = await requirePlatformPermission("users:manage");
  const isPlatformOwner = session.user.platformRole === "PLATFORM_OWNER";

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <nav aria-label="Breadcrumb">
        <Link
          href={"/admin/users" as Route}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline"
        >
          ← Users
        </Link>
      </nav>

      <div className="mt-4 mb-6">
        <Eyebrow>Account provisioning</Eyebrow>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">
          Create user
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Provision a password-based account from the admin panel. Credential
          material is hashed before storage and never returned by the API.
        </p>
      </div>

      <AdminCreateUserForm isPlatformOwner={isPlatformOwner} />
    </div>
  );
}
