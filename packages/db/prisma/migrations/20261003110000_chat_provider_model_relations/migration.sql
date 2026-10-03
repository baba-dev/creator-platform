-- Canonicalize Character Chat model identity on ProviderModel.id while
-- retaining the legacy upstream modelId columns for rollback/read compatibility.
ALTER TABLE `Persona`
  ADD COLUMN `providerModelRecordId` VARCHAR(191) NULL;

ALTER TABLE `ChatThread`
  ADD COLUMN `providerModelRecordId` VARCHAR(191) NULL;

-- All historical Chat/Persona rows were BytePlus-only. Backfill only BytePlus
-- TEXT rows so an upstream id reused by another provider is never selected
-- implicitly during migration.
UPDATE `Persona` AS p
JOIN `ProviderModel` AS pm
  ON pm.`providerModelId` = p.`modelId`
 AND pm.`provider` = 'BYTEPLUS'
 AND pm.`mediaKind` = 'TEXT'
SET p.`providerModelRecordId` = pm.`id`
WHERE p.`providerModelRecordId` IS NULL;

UPDATE `ChatThread` AS t
JOIN `ProviderModel` AS pm
  ON pm.`providerModelId` = t.`modelId`
 AND pm.`provider` = 'BYTEPLUS'
 AND pm.`mediaKind` = 'TEXT'
SET t.`providerModelRecordId` = pm.`id`
WHERE t.`providerModelRecordId` IS NULL;

CREATE INDEX `Persona_providerModelRecordId_idx`
  ON `Persona`(`providerModelRecordId`);

CREATE INDEX `ChatThread_providerModelRecordId_idx`
  ON `ChatThread`(`providerModelRecordId`);

ALTER TABLE `Persona`
  ADD CONSTRAINT `Persona_providerModelRecordId_fkey`
  FOREIGN KEY (`providerModelRecordId`) REFERENCES `ProviderModel`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ChatThread`
  ADD CONSTRAINT `ChatThread_providerModelRecordId_fkey`
  FOREIGN KEY (`providerModelRecordId`) REFERENCES `ProviderModel`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
