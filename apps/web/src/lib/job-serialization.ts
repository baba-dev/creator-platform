import type { getJobReconciliationDetails } from "@aiwa/generation";

type RawJobDetails = NonNullable<
  Awaited<ReturnType<typeof getJobReconciliationDetails>>
>;

export function serializeJobDetails(data: RawJobDetails | null) {
  if (!data) return null;
  const { job, ledgerEntries, auditEvents, permittedActions } = data;

  return {
    job: {
      ...job,
      reservedCredits: job.reservedCredits.toString(),
      chargedCredits: job.chargedCredits.toString(),
      actualProviderCostMicroUsd:
        job.actualProviderCostMicroUsd !== null &&
        job.actualProviderCostMicroUsd !== undefined
          ? job.actualProviderCostMicroUsd.toString()
          : null,
      organization: {
        ...job.organization,
        wallet: job.organization.wallet
          ? {
              ...job.organization.wallet,
              balanceCache: job.organization.wallet.balanceCache.toString(),
            }
          : null,
      },
      priceVersion: job.priceVersion
        ? {
            ...job.priceVersion,
            providerCostMicroUsd:
              job.priceVersion.providerCostMicroUsd.toString(),
            customerCredits: job.priceVersion.customerCredits.toString(),
            creditsPerBaisa: job.priceVersion.creditsPerBaisa.toString(),
          }
        : null,
      assets: job.assets.map((asset) => ({
        ...asset,
        byteSize: asset.byteSize.toString(),
      })),
    },
    ledgerEntries: ledgerEntries.map((entry) => ({
      ...entry,
      amountCredits: entry.amountCredits.toString(),
      balanceAfter: entry.balanceAfter.toString(),
      reversalOf: entry.reversalOf
        ? {
            ...entry.reversalOf,
            amountCredits: entry.reversalOf.amountCredits.toString(),
          }
        : null,
      reversals:
        "reversals" in entry && Array.isArray(entry.reversals)
          ? entry.reversals.map(
              (r: { id: string; type: string; amountCredits: bigint }) => ({
                ...r,
                amountCredits: r.amountCredits.toString(),
              }),
            )
          : [],
      reversedBy:
        "reversals" in entry &&
        Array.isArray(entry.reversals) &&
        entry.reversals[0]
          ? {
              ...entry.reversals[0],
              amountCredits: entry.reversals[0].amountCredits.toString(),
            }
          : "reversedBy" in entry && entry.reversedBy
            ? {
                ...(entry.reversedBy as {
                  id: string;
                  type: string;
                  amountCredits: bigint;
                }),
                amountCredits: (
                  entry.reversedBy as { amountCredits: bigint }
                ).amountCredits.toString(),
              }
            : null,
    })),
    auditEvents,
    permittedActions,
  };
}

export type SerializedJobDetails = NonNullable<
  ReturnType<typeof serializeJobDetails>
>;
