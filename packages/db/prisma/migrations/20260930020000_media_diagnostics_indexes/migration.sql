CREATE INDEX `MediaTask_status_updatedAt_idx` ON `MediaTask`(`status`, `updatedAt`);

CREATE INDEX `MediaTaskAttempt_finishedAt_outcome_idx` ON `MediaTaskAttempt`(`finishedAt`, `outcome`);
