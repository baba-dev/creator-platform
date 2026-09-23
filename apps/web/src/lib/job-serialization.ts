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
      reversedBy: entry.reversedBy
        ? {
            ...entry.reversedBy,
            amountCredits: entry.reversedBy.amountCredits.toString(),
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
