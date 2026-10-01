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
  `usage`.`usedBytes` =
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
  `usage`.`reservedBytes` = COALESCE((
    SELECT SUM(`asset`.`byteSize`)
    FROM `Asset` AS `asset`
    WHERE `asset`.`organizationId` = `usage`.`organizationId`
      AND `asset`.`status` = 'PENDING'
  ), 0),
  `usage`.`readyAssetCount` = (
    SELECT COUNT(*)
    FROM `Asset` AS `asset`
    WHERE `asset`.`organizationId` = `usage`.`organizationId`
      AND `asset`.`status` = 'READY'
  ),
  `usage`.`version` = `usage`.`version` + 1,
  `usage`.`reconciledAt` = CURRENT_TIMESTAMP(3),
  `usage`.`updatedAt` = CURRENT_TIMESTAMP(3);
