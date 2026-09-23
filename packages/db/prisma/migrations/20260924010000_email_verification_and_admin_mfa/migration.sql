-- AlterTable: Add twoFactorEnabled to User
ALTER TABLE `User` ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: TwoFactor
CREATE TABLE `TwoFactor` (
    `id` VARCHAR(191) NOT NULL,
    `secret` TEXT NOT NULL,
    `backupCodes` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT true,
    `failedVerificationCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TwoFactor_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TwoFactor` ADD CONSTRAINT `TwoFactor_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing membership or administrative role is not proof of mailbox ownership.
-- Only the non-human seeded system identity is grandfathered.
UPDATE `User`
SET `emailVerified` = true
WHERE `emailVerified` = false
  AND `email` = 'system@aiwamediagroup.com';
