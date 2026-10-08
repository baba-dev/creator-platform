import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { isBytePlusMediaKitConfigured } from "@aiwa/providers/byteplus";

import {
  ProviderToolCatalog,
  type ProviderToolCatalogRow,
} from "@/components/admin/provider-tool-catalog";
import { Eyebrow } from "@/components/ui/creative";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function ProviderToolsAdminPage() {
  const session = await requirePlatformPermission("models:read");
  const canManage = hasPlatformPermission(
    session.user.platformRole,
    "models:manage",
  );
  const now = new Date();
  const rows = await db.providerTool.findMany({
    include: {
      priceVersions: {
        where: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
      _count: { select: { executions: true } },
    },
    orderBy: [{ category: "asc" }, { displayName: "asc" }],
  });

  const serialized: ProviderToolCatalogRow[] = rows.map((row) => {
    const price = row.priceVersions[0];
    return {
      id: row.id,
      providerToolId: row.providerToolId,
      displayName: row.displayName,
      description: row.description,
      category: row.category,
      executionMode: row.executionMode,
      pricingMetric: row.pricingMetric,
      capabilities: row.capabilities as Record<string, unknown>,
      enabled: row.enabled,
      executionCount: row._count.executions,
      price: price
        ? {
            providerCostMicroUsd: price.providerCostMicroUsd.toString(),
            providerCostNoOutputMicroUsd:
              price.providerCostNoOutputMicroUsd?.toString() ?? null,
            customerCredits: price.customerCredits.toString(),
            unitQuantity: price.unitQuantity,
            proportional: price.proportional,
            resolutionRates: price.resolutionRates as Record<
              string,
              string
            > | null,
            targetMarginBps: price.targetMarginBps,
            providerCostBasisNote: price.providerCostBasisNote,
          }
        : null,
    };
  });

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <Eyebrow>Provider operations</Eyebrow>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            MediaKit tools
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Audited BytePlus MediaKit registry, commercial price snapshots and
            availability controls. Tool execution remains disabled until a valid
            price is published and an operator enables the tool.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs">
          <span className="font-semibold">Worker credential: </span>
          <span
            className={
              isBytePlusMediaKitConfigured() ? "text-success" : "text-warning"
            }
          >
            {isBytePlusMediaKitConfigured() ? "configured" : "not configured"}
          </span>
        </div>
      </div>
      <div className="mt-7">
        <ProviderToolCatalog
          initialRows={serialized}
          canManage={canManage}
          runtimeConfigured={isBytePlusMediaKitConfigured()}
        />
      </div>
    </div>
  );
}
