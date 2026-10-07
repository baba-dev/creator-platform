ALTER TABLE `ProviderToolPriceVersion`
  ADD COLUMN `providerCostNoOutputMicroUsd` BIGINT NULL AFTER `providerCostMicroUsd`;

ALTER TABLE `Asset`
  ADD COLUMN `providerToolExecutionId` VARCHAR(191) NULL AFTER `generationJobId`,
  ADD COLUMN `providerToolOutputIndex` INTEGER NULL AFTER `providerToolExecutionId`,
  ADD UNIQUE INDEX `Asset_providerToolExecutionId_providerToolOutputIndex_key`(`providerToolExecutionId`, `providerToolOutputIndex`),
  ADD INDEX `Asset_providerToolExecutionId_idx`(`providerToolExecutionId`),
  ADD CONSTRAINT `Asset_providerToolExecutionId_fkey`
    FOREIGN KEY (`providerToolExecutionId`) REFERENCES `ProviderToolExecution`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `ProviderToolInputAsset` (
  `executionId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `role` VARCHAR(32) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`executionId`, `assetId`),
  UNIQUE INDEX `ProviderToolInputAsset_executionId_position_key`(`executionId`, `position`),
  INDEX `ProviderToolInputAsset_executionId_role_position_idx`(`executionId`, `role`, `position`),
  INDEX `ProviderToolInputAsset_assetId_idx`(`assetId`),
  CONSTRAINT `ProviderToolInputAsset_executionId_fkey`
    FOREIGN KEY (`executionId`) REFERENCES `ProviderToolExecution`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ProviderToolInputAsset_assetId_fkey`
    FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
