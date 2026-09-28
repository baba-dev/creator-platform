-- Reference inputs are first-class private assets. Existing rows remain generated outputs.
ALTER TABLE `Asset`
  ADD COLUMN `purpose` ENUM('GENERATED', 'REFERENCE_INPUT') NOT NULL DEFAULT 'GENERATED';

CREATE TABLE `GenerationInputAsset` (
  `generationJobId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`generationJobId`, `assetId`),
  UNIQUE INDEX `GenerationInputAsset_generationJobId_position_key`(`generationJobId`, `position`),
  INDEX `GenerationInputAsset_assetId_idx`(`assetId`),

  CONSTRAINT `GenerationInputAsset_generationJobId_fkey`
    FOREIGN KEY (`generationJobId`) REFERENCES `GenerationJob`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `GenerationInputAsset_assetId_fkey`
    FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- Normalize persisted capabilities so existing environments expose the same
-- contract as the verified provider descriptors without requiring a seed run.
UPDATE `ProviderModel`
SET `capabilities` = JSON_OBJECT(
  'aspectRatio:1:1', TRUE,
  'aspectRatio:4:3', TRUE,
  'aspectRatio:3:4', TRUE,
  'aspectRatio:16:9', TRUE,
  'aspectRatio:9:16', TRUE,
  'aspectRatio:3:2', TRUE,
  'aspectRatio:2:3', TRUE,
  'aspectRatio:21:9', TRUE,
  'resolution:2K', TRUE,
  'resolution:3K', TRUE,
  'resolution:4K', TRUE,
  'referenceImages', TRUE,
  'maxReferenceImages', 14
)
WHERE `provider` = 'BYTEPLUS'
  AND `providerModelId` = 'seedream-5-0-260128'
  AND `mediaKind` = 'IMAGE';

UPDATE `ProviderModel`
SET `capabilities` = JSON_OBJECT(
  'aspectRatio:1:1', TRUE,
  'aspectRatio:4:3', TRUE,
  'aspectRatio:3:4', TRUE,
  'aspectRatio:16:9', TRUE,
  'aspectRatio:9:16', TRUE,
  'aspectRatio:3:2', TRUE,
  'aspectRatio:2:3', TRUE,
  'aspectRatio:21:9', TRUE,
  'resolution:2K', TRUE,
  'resolution:4K', TRUE,
  'referenceImages', TRUE,
  'maxReferenceImages', 14
)
WHERE `provider` = 'BYTEPLUS'
  AND `providerModelId` = 'seedream-4-5-251128'
  AND `mediaKind` = 'IMAGE';
