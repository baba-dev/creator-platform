ALTER TABLE `Asset`
  ADD COLUMN `expiresAt` DATETIME(3) NULL;

CREATE INDEX `Asset_expiresAt_status_idx` ON `Asset`(`expiresAt`, `status`);

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
