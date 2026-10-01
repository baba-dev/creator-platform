/**
 * Interleave jobs across organizations while preserving every job selected by
 * the database scan. Fairness is ordering, not admission: dropping rows after
 * advancing a keyset cursor can defer most of a busy tenant until cursor wrap.
 */
export function applyTenantFairness<T extends { organizationId: string }>(
  jobs: readonly T[],
): T[] {
  if (jobs.length <= 1) return [...jobs];

  const perOrg = new Map<string, T[]>();
  for (const job of jobs) {
    const list = perOrg.get(job.organizationId);
    if (list) list.push(job);
    else perOrg.set(job.organizationId, [job]);
  }

  const result: T[] = [];
  let round = 0;
  while (result.length < jobs.length) {
    for (const list of perOrg.values()) {
      if (round < list.length) result.push(list[round]!);
    }
    round += 1;
  }

  return result;
}

/**
 * Keep provider polling responsive when new submissions are continuously
 * arriving. Each class is already tenant-fair, so alternate them without
 * changing the relative order inside either class.
 */
export function interleaveGenerationWork<T>(
  submissions: readonly T[],
  polls: readonly T[],
): T[] {
  const result: T[] = [];
  const length = Math.max(submissions.length, polls.length);
  for (let index = 0; index < length; index += 1) {
    if (index < submissions.length) result.push(submissions[index]!);
    if (index < polls.length) result.push(polls[index]!);
  }
  return result;
}
