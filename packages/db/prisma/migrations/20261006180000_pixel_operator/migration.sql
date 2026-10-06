CREATE TABLE `PixelWorkflow` (
 `id` VARCHAR(191) NOT NULL, `threadId` VARCHAR(191) NOT NULL, `requestKey` VARCHAR(191) NOT NULL,
 `title` VARCHAR(160) NOT NULL, `cancelledAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE INDEX `PixelWorkflow_threadId_requestKey_key` (`threadId`, `requestKey`),
 INDEX `PixelWorkflow_threadId_createdAt_idx` (`threadId`, `createdAt`),
 CONSTRAINT `PixelWorkflow_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `PixelAction` (
 `id` VARCHAR(191) NOT NULL, `workflowId` VARCHAR(191) NOT NULL, `position` INTEGER NOT NULL, `payload` JSON NOT NULL,
 `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT', `quote` JSON NULL, `jobId` VARCHAR(191) NULL,
 `approvedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `PixelAction_workflowId_position_key` (`workflowId`, `position`),
 INDEX `PixelAction_workflowId_status_idx` (`workflowId`, `status`),
 CONSTRAINT `PixelAction_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `PixelWorkflow` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `PixelPreference` (
 `organizationId` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `preferences` JSON NOT NULL, `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`organizationId`, `userId`),
 CONSTRAINT `PixelPreference_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `PixelPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
