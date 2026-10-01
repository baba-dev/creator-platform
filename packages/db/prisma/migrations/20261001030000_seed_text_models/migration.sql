-- Expand the generation MediaKind enum to include TEXT.
-- Asset.mediaKind uses the separate AssetMediaKind enum and must not be altered here.
ALTER TABLE `ProviderModel` MODIFY COLUMN `mediaKind` ENUM('IMAGE', 'VIDEO', 'VOICE', 'REASONING', 'TEXT') NOT NULL;
ALTER TABLE `GenerationTemplate` MODIFY COLUMN `mediaKind` ENUM('IMAGE', 'VIDEO', 'VOICE', 'REASONING', 'TEXT') NOT NULL;

-- Personas for Character Chat and conversational assistants
CREATE TABLE `Persona` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `avatarUrl` VARCHAR(191) NULL,
  `tag` VARCHAR(191) NULL,
  `description` TEXT NULL,
  `systemPrompt` TEXT NOT NULL,
  `voiceKey` VARCHAR(191) NULL,
  `modelId` VARCHAR(191) NOT NULL DEFAULT 'doubao-seed-character-260628',
  `isPreset` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Persona_organizationId_isPreset_createdAt_idx`(`organizationId`, `isPreset`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Persona`
  ADD CONSTRAINT `Persona_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Persona_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Multi-turn Chat Threads
CREATE TABLE `ChatThread` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `personaId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `modelId` VARCHAR(191) NOT NULL DEFAULT 'doubao-seed-character-260628',
  `systemPrompt` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ChatThread_organizationId_createdById_updatedAt_idx`(`organizationId`, `createdById`, `updatedAt`),
  INDEX `ChatThread_projectId_idx`(`projectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ChatThread`
  ADD CONSTRAINT `ChatThread_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatThread_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatThread_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatThread_personaId_fkey`
  FOREIGN KEY (`personaId`) REFERENCES `Persona`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Chat Messages in a Thread
CREATE TABLE `ChatMessage` (
  `id` VARCHAR(191) NOT NULL,
  `threadId` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `tokensUsed` INTEGER NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ChatMessage_threadId_createdAt_idx`(`threadId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ChatMessage`
  ADD CONSTRAINT `ChatMessage_threadId_fkey`
  FOREIGN KEY (`threadId`) REFERENCES `ChatThread`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Scriptwriting Studio scripts
CREATE TABLE `Script` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `logline` TEXT NULL,
  `targetDurationSeconds` INTEGER NULL,
  `content` JSON NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Script_organizationId_updatedAt_idx`(`organizationId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Script`
  ADD CONSTRAINT `Script_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Script_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Script_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Brand Profiles for Brand Assistants
CREATE TABLE `BrandProfile` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `tagline` VARCHAR(191) NULL,
  `voiceTone` TEXT NULL,
  `guidelines` TEXT NULL,
  `targetAudience` TEXT NULL,
  `vocabulary` JSON NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `BrandProfile_organizationId_updatedAt_idx`(`organizationId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BrandProfile`
  ADD CONSTRAINT `BrandProfile_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `BrandProfile_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Structured Story Planning
CREATE TABLE `StoryPlan` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `genre` VARCHAR(191) NULL,
  `premise` TEXT NULL,
  `structureType` VARCHAR(191) NOT NULL DEFAULT 'THREE_ACT',
  `beats` JSON NOT NULL,
  `characters` JSON NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `StoryPlan_organizationId_updatedAt_idx`(`organizationId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StoryPlan`
  ADD CONSTRAINT `StoryPlan_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `StoryPlan_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `StoryPlan_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
