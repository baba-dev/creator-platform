-- Conversational Creative Workflow: ChatThread typing/state and GenerationJob lineage
ALTER TABLE `ChatThread`
  ADD COLUMN `threadType` VARCHAR(32) NOT NULL DEFAULT 'CHARACTER',
  ADD COLUMN `state` JSON NULL;

ALTER TABLE `GenerationJob`
  ADD COLUMN `parentGenerationId` VARCHAR(191) NULL,
  ADD COLUMN `chatThreadId` VARCHAR(191) NULL;

CREATE INDEX `ChatThread_organizationId_threadType_updatedAt_idx`
  ON `ChatThread`(`organizationId`, `threadType`, `updatedAt`);

CREATE INDEX `GenerationJob_parentGenerationId_idx`
  ON `GenerationJob`(`parentGenerationId`);

CREATE INDEX `GenerationJob_chatThreadId_idx`
  ON `GenerationJob`(`chatThreadId`);

ALTER TABLE `GenerationJob`
  ADD CONSTRAINT `GenerationJob_parentGenerationId_fkey`
  FOREIGN KEY (`parentGenerationId`) REFERENCES `GenerationJob`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `GenerationJob`
  ADD CONSTRAINT `GenerationJob_chatThreadId_fkey`
  FOREIGN KEY (`chatThreadId`) REFERENCES `ChatThread`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
