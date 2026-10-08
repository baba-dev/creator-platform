CREATE TABLE `SeedAudioSegment` (
  `id` VARCHAR(191) NOT NULL,
  `generationJobId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `objectKey` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(64) NOT NULL,
  `byteSize` BIGINT NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `providerRequestId` VARCHAR(191) NOT NULL,
  `durationMs` INTEGER NOT NULL,
  `subtitle` JSON NULL,
  `usage` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `SeedAudioSegment_objectKey_key`(`objectKey`),
  UNIQUE INDEX `SeedAudioSegment_generationJobId_position_key`(`generationJobId`, `position`),
  INDEX `SeedAudioSegment_generationJobId_createdAt_idx`(`generationJobId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SeedAudioSegment`
  ADD CONSTRAINT `SeedAudioSegment_generationJobId_fkey`
  FOREIGN KEY (`generationJobId`) REFERENCES `GenerationJob`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
