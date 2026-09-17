-- Add authoritative ownership and storage attribution without rebuilding tables.
ALTER TABLE `Organization` ADD COLUMN `ownerUserId` VARCHAR(191) NULL;
ALTER TABLE `Membership` CHANGE COLUMN `spendingCap` `monthlySpendingCapCredits` BIGINT NULL;
ALTER TABLE `Asset` ADD COLUMN `storageOwnerUserId` VARCHAR(191) NULL;

-- Prefer the self-service creator, then the oldest existing owner membership.
UPDATE `Organization` o
LEFT JOIN (
  SELECT candidate.organizationId, candidate.userId
  FROM `Membership` candidate
  WHERE candidate.role = 'ORGANIZATION_OWNER'
    AND NOT EXISTS (
      SELECT 1 FROM `Membership` earlier
      WHERE earlier.organizationId = candidate.organizationId
        AND earlier.role = 'ORGANIZATION_OWNER'
        AND (
          earlier.createdAt < candidate.createdAt
          OR (earlier.createdAt = candidate.createdAt AND earlier.id < candidate.id)
        )
    )
) owners ON owners.organizationId = o.id
SET o.ownerUserId = COALESCE(o.selfServeCreatorUserId, owners.userId);

-- The NOT NULL conversion below deliberately fails if a legacy organization has no repairable owner.

-- Ensure the authoritative owner has a membership and normalize duplicate legacy owner roles.
INSERT INTO `Membership` (`id`, `organizationId`, `userId`, `role`, `createdAt`, `updatedAt`)
SELECT CONCAT('migrated_owner_', o.id), o.id, o.ownerUserId, 'ORGANIZATION_OWNER', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `Organization` o
LEFT JOIN `Membership` m ON m.organizationId = o.id AND m.userId = o.ownerUserId
WHERE m.id IS NULL;
UPDATE `Membership` m JOIN `Organization` o ON o.id = m.organizationId
SET m.role = CASE WHEN m.userId = o.ownerUserId THEN 'ORGANIZATION_OWNER' ELSE 'ORGANIZATION_MEMBER' END
WHERE m.role = 'ORGANIZATION_OWNER' OR m.userId = o.ownerUserId;

-- Generated assets inherit the generation creator where possible; other legacy assets stay nullable.
UPDATE `Asset` a JOIN `GenerationJob` j ON j.id = a.generationJobId
SET a.storageOwnerUserId = j.createdById WHERE a.storageOwnerUserId IS NULL;

ALTER TABLE `Organization` MODIFY `ownerUserId` VARCHAR(191) NOT NULL;
CREATE INDEX `Organization_ownerUserId_idx` ON `Organization`(`ownerUserId`);
CREATE INDEX `Organization_status_createdAt_idx` ON `Organization`(`status`, `createdAt`);
CREATE INDEX `Membership_organizationId_role_idx` ON `Membership`(`organizationId`, `role`);
CREATE INDEX `Asset_organizationId_storageOwnerUserId_status_idx` ON `Asset`(`organizationId`, `storageOwnerUserId`, `status`);
ALTER TABLE `Organization` ADD CONSTRAINT `Organization_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_storageOwnerUserId_fkey` FOREIGN KEY (`storageOwnerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
