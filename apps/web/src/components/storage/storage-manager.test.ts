import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => createElement("button", { disabled }, children),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => createElement("span") }));
vi.stubGlobal("React", React);
import { StorageManager } from "./storage-manager";

for (const activeProvider of ["LOCAL", "GOOGLE_DRIVE", "ONEDRIVE"] as const) {
  it(`shows activation controls for both inactive pools when ${activeProvider} is active`, () => {
    const html = renderToStaticMarkup(
      createElement(StorageManager, {
        organizationId: "org",
        activeProvider,
        canManage: true,
        googleConfigured: true,
        oneDriveConfigured: true,
        configs: ["GOOGLE_DRIVE", "ONEDRIVE"].map((provider) => ({
          id: provider,
          provider: provider as "GOOGLE_DRIVE" | "ONEDRIVE",
          status: "ACTIVE",
          accountEmail: null,
          rootFolderName: "Creators-Data",
          createdAt: "2026-01-01",
        })),
      }),
    );
    expect(html.match(/Set as Active Storage/g)).toHaveLength(2);
    expect(html.match(/>Active<\/span>/g)).toHaveLength(1);
    expect(html.match(/Loading storage usage/g)).toHaveLength(3);
  });
}
