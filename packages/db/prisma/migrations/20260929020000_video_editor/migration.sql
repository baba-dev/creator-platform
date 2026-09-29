CREATE TABLE `VideoEdit` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `document` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `VideoEdit_organizationId_updatedAt_idx`(`organizationId`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE `ProviderModel`
SET `capabilities` = JSON_MERGE_PATCH(COALESCE(`capabilities`, JSON_OBJECT()),
  JSON_OBJECT('aspectRatio:adaptive', TRUE, 'firstFrame', TRUE, 'lastFrame', TRUE))
WHERE `provider` = 'BYTEPLUS' AND `providerModelId` = 'dreamina-seedance-2-5-260628'
  AND `mediaKind` = 'VIDEO';

CREATE TABLE `VideoRender` (
  `id` VARCHAR(191) NOT NULL,
  `editId` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `outputAssetId` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL,
  `document` JSON NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `processingAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `errorMessage` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `VideoRender_outputAssetId_key`(`outputAssetId`),
  UNIQUE INDEX `VideoRender_idempotencyKey_key`(`idempotencyKey`),
  INDEX `VideoRender_status_updatedAt_idx`(`status`, `updatedAt`),
  INDEX `VideoRender_organizationId_createdById_createdAt_idx`(`organizationId`, `createdById`, `createdAt`),
  CONSTRAINT `VideoRender_editId_fkey` FOREIGN KEY (`editId`) REFERENCES `VideoEdit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VideoRender_outputAssetId_fkey` FOREIGN KEY (`outputAssetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoRenderInput` (
  `renderId` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`renderId`, `assetId`),
  INDEX `VideoRenderInput_assetId_idx`(`assetId`),
  CONSTRAINT `VideoRenderInput_renderId_fkey` FOREIGN KEY (`renderId`) REFERENCES `VideoRender`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VideoRenderInput_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
