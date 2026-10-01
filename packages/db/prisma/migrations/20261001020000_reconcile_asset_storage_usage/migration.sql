-- Reconcile cached physical storage accounting after variants become billable capacity.
-- Existing AssetStorageUsage rows predate variant accounting, so without this
-- backfill purging a legacy asset could subtract variant bytes that were never
-- present in usedBytes.

INSERT IGNORE INTO `AssetStorageUsage` (
  `organizationId`,
  `usedBytes`,
  `reservedBytes`,
  `readyAssetCount`,
  `version`,
  `reconciledAt`,
  `updatedAt`
)
SELECT
  `Organization`.`id`,
  0,
  0,
  0,
  0,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Organization`;

UPDATE `AssetStorageUsage` AS `usage`
SET
  `usedBytes` =
    COALESCE((
      SELECT SUM(`asset`.`byteSize`)
      FROM `Asset` AS `asset`
      WHERE `asset`.`organizationId` = `usage`.`organizationId`
        AND `asset`.`status` IN ('READY', 'QUARANTINED', 'DELETED', 'PURGING')
    ), 0) +
    COALESCE((
      SELECT SUM(`variant`.`byteSize`)
      FROM `AssetVariant` AS `variant`
      INNER JOIN `Asset` AS `asset` ON `asset`.`id` = `variant`.`assetId`
      WHERE `asset`.`organizationId` = `usage`.`organizationId`
        AND `asset`.`status` IN ('READY', 'QUARANTINED', 'DELETED', 'PURGING')
    ), 0),
  `reservedBytes` = COALESCE((
    SELECT SUM(`asset`.`byteSize`)
    FROM `Asset` AS `asset`
    WHERE `asset`.`organizationId` = `usage`.`organizationId`
      AND `asset`.`status` = 'PENDING'
  ), 0),
  `readyAssetCount` = (
    SELECT COUNT(*)
    FROM `Asset` AS `asset`
    WHERE `asset`.`organizationId` = `usage`.`organizationId`
      AND `asset`.`status` = 'READY'
  ),
  `version` = `version` + 1,
  `reconciledAt` = CURRENT_TIMESTAMP(3),
  `updatedAt` = CURRENT_TIMESTAMP(3);
