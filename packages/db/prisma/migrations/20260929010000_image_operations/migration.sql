ALTER TABLE `Asset` ADD COLUMN `sourceAssetId` VARCHAR(191) NULL;
CREATE INDEX `Asset_sourceAssetId_idx` ON `Asset`(`sourceAssetId`);
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_sourceAssetId_fkey` FOREIGN KEY (`sourceAssetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ImageOperation` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `sourceAssetId` VARCHAR(191) NOT NULL,
  `outputAssetId` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `requestPayload` JSON NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `errorMessage` VARCHAR(191) NULL,
  `processingAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ImageOperation_outputAssetId_key` (`outputAssetId`),
  UNIQUE INDEX `ImageOperation_idempotencyKey_key` (`idempotencyKey`),
  INDEX `ImageOperation_organizationId_createdById_createdAt_idx` (`organizationId`, `createdById`, `createdAt`),
  INDEX `ImageOperation_status_updatedAt_idx` (`status`, `updatedAt`),
  CONSTRAINT `ImageOperation_sourceAssetId_fkey` FOREIGN KEY (`sourceAssetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ImageOperation_outputAssetId_fkey` FOREIGN KEY (`outputAssetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
