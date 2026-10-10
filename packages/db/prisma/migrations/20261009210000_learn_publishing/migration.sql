-- CreateTable
CREATE TABLE `LearnPost` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `draft` JSON NOT NULL,
    `published` JSON NULL,
    `title` VARCHAR(240) NOT NULL,
    `excerpt` TEXT NOT NULL,
    `searchText` MEDIUMTEXT NOT NULL,
    `topic` VARCHAR(80) NOT NULL,
    `locale` VARCHAR(16) NOT NULL DEFAULT 'en',
    `translationKey` VARCHAR(100) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `publishedAt` DATETIME(3) NULL,
    `modifiedAt` DATETIME(3) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `reviewAt` DATETIME(3) NULL,
    `scheduleError` VARCHAR(240) NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LearnPost_slug_key`(`slug`),
    INDEX `LearnPost_publishedAt_id_idx`(`publishedAt`, `id`),
    INDEX `LearnPost_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `LearnPost_topic_locale_idx`(`topic`, `locale`),
    UNIQUE INDEX `LearnPost_translationKey_locale_key`(`translationKey`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearnRevision` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `content` JSON NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LearnRevision_postId_createdAt_idx`(`postId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearnRedirect` (
    `slug` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearnMedia` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `alt` VARCHAR(500) NOT NULL,
    `caption` VARCHAR(1000) NOT NULL,
    `credit` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LearnMedia_assetId_key`(`assetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearnPostMedia` (
    `postId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`postId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearnEvent` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `visitor` VARCHAR(64) NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LearnEvent_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `LearnEvent_postId_kind_visitor_day_key`(`postId`, `kind`, `visitor`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearnAttribution` (
    `userId` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `convertedAt` DATETIME(3) NULL,

    INDEX `LearnAttribution_convertedAt_expiresAt_idx`(`convertedAt`, `expiresAt`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LearnRevision` ADD CONSTRAINT `LearnRevision_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `LearnPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearnRedirect` ADD CONSTRAINT `LearnRedirect_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `LearnPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearnMedia` ADD CONSTRAINT `LearnMedia_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearnPostMedia` ADD CONSTRAINT `LearnPostMedia_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `LearnPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearnPostMedia` ADD CONSTRAINT `LearnPostMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `LearnMedia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearnEvent` ADD CONSTRAINT `LearnEvent_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `LearnPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearnAttribution` ADD CONSTRAINT `LearnAttribution_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `LearnPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
