-- Persist asynchronous NVIDIA reasoning jobs used by Creative Copilot features.
CREATE TABLE `ReasoningJob` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `providerModelId` VARCHAR(191) NOT NULL,
  `status` ENUM('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `requestPayload` JSON NOT NULL,
  `outputPayload` JSON NULL,
  `providerRequestId` VARCHAR(191) NULL,
  `inputTokens` INTEGER NULL,
  `outputTokens` INTEGER NULL,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `queuedAt` DATETIME(3) NULL,
  `processingAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ReasoningJob_idempotencyKey_key`(`idempotencyKey`),
  INDEX `ReasoningJob_organizationId_status_createdAt_idx`(`organizationId`, `status`, `createdAt`),
  INDEX `ReasoningJob_createdById_organizationId_status_createdAt_idx`(`createdById`, `organizationId`, `status`, `createdAt`),
  INDEX `ReasoningJob_createdById_organizationId_createdAt_idx`(`createdById`, `organizationId`, `createdAt`),
  INDEX `ReasoningJob_status_updatedAt_idx`(`status`, `updatedAt`),
  INDEX `ReasoningJob_providerRequestId_idx`(`providerRequestId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ReasoningJob`
  ADD CONSTRAINT `ReasoningJob_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ReasoningJob_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ReasoningJob_providerModelId_fkey`
  FOREIGN KEY (`providerModelId`) REFERENCES `ProviderModel`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- Enable the verified default NVIDIA reasoning model so the feature works after
-- migration without requiring a one-off seed command. Custom models remain
-- selectable through NVIDIA_REASONING_MODEL after being added to ProviderModel.
INSERT IGNORE INTO `ProviderModel` (
  `id`,
  `provider`,
  `providerModelId`,
  `mediaKind`,
  `displayName`,
  `description`,
  `capabilities`,
  `negotiatedDiscountBps`,
  `enabled`,
  `createdAt`,
  `updatedAt`
) VALUES (
  'nvidia-nemotron-3-nano-omni',
  'NVIDIA',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'REASONING',
  'NVIDIA Nemotron 3 Nano Omni',
  'Creative reasoning for prompt enhancement and future copilot workflows.',
  JSON_OBJECT('task:prompt-enhancement', TRUE, 'instructMode', TRUE),
  0,
  TRUE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
);
