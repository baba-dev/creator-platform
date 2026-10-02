ALTER TABLE `ChatMessage`
  ADD COLUMN `clientRequestId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `ChatMessage_threadId_clientRequestId_role_key`
  ON `ChatMessage`(`threadId`, `clientRequestId`, `role`);

ALTER TABLE `Script`
  ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1;
