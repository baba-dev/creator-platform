/**
 * Interleave jobs across organizations to ensure fairness and prevent a single
 * organization with many queued jobs from starving other tenants.
 */
export function applyTenantFairness<T extends { organizationId: string }>(
  jobs: T[],
  maxPerTenant = 10,
): T[] {
  if (jobs.length <= 1) return jobs;

  const perOrg = new Map<string, T[]>();
  for (const job of jobs) {
    const list = perOrg.get(job.organizationId);
    if (list) {
      if (list.length < maxPerTenant) {
        list.push(job);
      }
    } else {
      perOrg.set(job.organizationId, [job]);
    }
  }

  const result: T[] = [];
  let added = true;
  let round = 0;

  while (added && round < maxPerTenant) {
    added = false;
    for (const list of perOrg.values()) {
      if (round < list.length) {
        result.push(list[round]!);
        added = true;
      }
    }
    round++;
  }

  return result;
}
