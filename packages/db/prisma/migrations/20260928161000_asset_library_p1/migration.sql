-- P1 asset library organization metadata.
ALTER TABLE `Asset`
  ADD COLUMN `folderId` VARCHAR(191) NULL;

CREATE TABLE `AssetFolder` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `parentId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AssetFolder_organizationId_parentId_name_idx` (`organizationId`, `parentId`, `name`),
  CONSTRAINT `AssetFolder_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssetFolder_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `AssetFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssetTag` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `normalizedName` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AssetTag_organizationId_normalizedName_key` (`organizationId`, `normalizedName`),
  INDEX `AssetTag_organizationId_name_idx` (`organizationId`, `name`),
  CONSTRAINT `AssetTag_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssetTagAssignment` (
  `assetId` VARCHAR(191) NOT NULL,
  `tagId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`assetId`, `tagId`),
  INDEX `AssetTagAssignment_tagId_assetId_idx` (`tagId`, `assetId`),
  CONSTRAINT `AssetTagAssignment_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssetTagAssignment_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `AssetTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssetFavorite` (
  `assetId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`assetId`, `userId`),
  INDEX `AssetFavorite_userId_createdAt_idx` (`userId`, `createdAt`),
  CONSTRAINT `AssetFavorite_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssetFavorite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Asset_folderId_status_createdAt_idx` ON `Asset`(`folderId`, `status`, `createdAt`);
ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `AssetFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
