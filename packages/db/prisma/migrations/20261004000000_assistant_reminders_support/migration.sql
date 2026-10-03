-- Pixel assistant: durable reminders/support and canonical model settings
CREATE TABLE `AssistantReminder` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `threadId` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `remindAt` DATETIME(3) NOT NULL,
  `notifiedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AssistantReminder_idempotencyKey_key`(`idempotencyKey`),
  INDEX `AssistantReminder_userId_remindAt_idx`(`userId`, `remindAt`),
  INDEX `AssistantReminder_organizationId_remindAt_idx`(`organizationId`, `remindAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AssistantReminder_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AssistantReminder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssistantReminder_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportRequest` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `threadId` VARCHAR(191) NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `ticketRef` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SupportRequest_idempotencyKey_key`(`idempotencyKey`),
  UNIQUE INDEX `SupportRequest_ticketRef_key`(`ticketRef`),
  INDEX `SupportRequest_organizationId_status_createdAt_idx`(`organizationId`, `status`, `createdAt`),
  INDEX `SupportRequest_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SupportRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `SupportRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SupportRequest_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssistantSetting` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'default',
  `providerModelRecordId` VARCHAR(191) NULL,
  `pricingMode` VARCHAR(191) NOT NULL DEFAULT 'FREE',
  `systemPromptOverride` TEXT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `updatedById` VARCHAR(191) NULL,
  INDEX `AssistantSetting_providerModelRecordId_idx`(`providerModelRecordId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AssistantSetting_providerModelRecordId_fkey` FOREIGN KEY (`providerModelRecordId`) REFERENCES `ProviderModel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AssistantSetting_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `AssistantSetting` (`id`, `providerModelRecordId`, `pricingMode`, `enabled`)
SELECT 'default', pm.`id`, 'FREE', 1
FROM `ProviderModel` pm
WHERE pm.`mediaKind` = 'TEXT' AND pm.`enabled` = 1
ORDER BY (pm.`provider` = 'GROQ' AND pm.`providerModelId` = 'openai/gpt-oss-20b') DESC, pm.`displayName` ASC
LIMIT 1
ON DUPLICATE KEY UPDATE `providerModelRecordId` = VALUES(`providerModelRecordId`);
