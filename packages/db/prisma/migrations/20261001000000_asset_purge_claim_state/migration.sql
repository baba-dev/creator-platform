-- Prevent restore/purge races by introducing an explicit in-progress purge state.
ALTER TABLE `Asset`
  MODIFY COLUMN `status`
    ENUM('PENDING', 'READY', 'QUARANTINED', 'DELETED', 'PURGING', 'PURGED')
    NOT NULL DEFAULT 'PENDING';
