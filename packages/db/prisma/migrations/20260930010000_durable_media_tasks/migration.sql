-- CreateTable
CREATE TABLE `MediaTask` (
    `id` VARCHAR(191) NOT NULL,
    `taskKey` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(128) NOT NULL,
    `organizationId` VARCHAR(128) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `processingVersion` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING', 'PROCESSING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'REVIEW') NOT NULL DEFAULT 'PENDING',
    `cycle` INTEGER NOT NULL DEFAULT 1,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `nextAttemptAt` DATETIME(3) NULL,
    `owner` VARCHAR(64) NULL,
    `fence` INTEGER NOT NULL DEFAULT 0,
    `leaseUntil` DATETIME(3) NULL,
    `errorCode` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MediaTask_taskKey_key`(`taskKey`),
    INDEX `MediaTask_status_nextAttemptAt_updatedAt_idx`(`status`, `nextAttemptAt`, `updatedAt`),
    INDEX `MediaTask_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaTaskAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `cycle` INTEGER NOT NULL,
    `number` INTEGER NOT NULL,
    `fence` INTEGER NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `outcome` VARCHAR(32) NULL,
    `errorCode` VARCHAR(64) NULL,
    `outputObjectKey` VARCHAR(191) NULL,

    UNIQUE INDEX `MediaTaskAttempt_taskId_fence_key`(`taskId`, `fence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaCapacity` (
    `id` VARCHAR(64) NOT NULL,
    `owner` VARCHAR(64) NULL,
    `fence` INTEGER NOT NULL DEFAULT 0,
    `leaseUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MediaTaskAttempt` ADD CONSTRAINT `MediaTaskAttempt_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `MediaTask`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
