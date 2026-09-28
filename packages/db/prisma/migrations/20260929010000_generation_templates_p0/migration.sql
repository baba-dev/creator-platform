-- P0 generation templates: curated platform recipes, favourites and job provenance.
CREATE TABLE `GenerationTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` LONGTEXT NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `mediaKind` ENUM('IMAGE','VIDEO','VOICE','REASONING') NOT NULL,
  `status` ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `promptTemplate` LONGTEXT NOT NULL,
  `variables` JSON NOT NULL,
  `defaultInput` JSON NOT NULL,
  `preferredModelId` VARCHAR(191) NULL,
  `thumbnailAssetId` VARCHAR(191) NULL,
  `featured` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `usageCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GenerationTemplate_slug_key`(`slug`),
  INDEX `GenerationTemplate_status_mediaKind_featured_sortOrder_idx`(`status`, `mediaKind`, `featured`, `sortOrder`),
  INDEX `GenerationTemplate_category_status_idx`(`category`, `status`),
  INDEX `GenerationTemplate_thumbnailAssetId_idx`(`thumbnailAssetId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TemplateFavorite` (
  `userId` VARCHAR(191) NOT NULL,
  `templateId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `TemplateFavorite_templateId_createdAt_idx`(`templateId`, `createdAt`),
  PRIMARY KEY (`userId`, `templateId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GenerationJob` ADD COLUMN `templateId` VARCHAR(191) NULL;
CREATE INDEX `GenerationJob_templateId_createdAt_idx` ON `GenerationJob`(`templateId`, `createdAt`);

ALTER TABLE `GenerationTemplate`
  ADD CONSTRAINT `GenerationTemplate_thumbnailAssetId_fkey`
  FOREIGN KEY (`thumbnailAssetId`) REFERENCES `Asset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TemplateFavorite`
  ADD CONSTRAINT `TemplateFavorite_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TemplateFavorite_templateId_fkey`
  FOREIGN KEY (`templateId`) REFERENCES `GenerationTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GenerationJob`
  ADD CONSTRAINT `GenerationJob_templateId_fkey`
  FOREIGN KEY (`templateId`) REFERENCES `GenerationTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
