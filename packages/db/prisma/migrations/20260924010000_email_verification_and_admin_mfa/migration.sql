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

-- Controlled migration: Backfill email verification only for established, trusted accounts
-- prior to enforcing email verification for workspace access and invitations.
-- Accounts with platform administrative roles, organization ownership, or existing active memberships
-- are marked verified, while unattached or unvetted accounts remain unverified.
UPDATE `User`
SET `emailVerified` = true
WHERE `emailVerified` = false
  AND (
    `platformRole` <> 'USER'
    OR `id` IN (SELECT `ownerUserId` FROM `Organization`)
    OR `id` IN (SELECT `userId` FROM `Membership`)
  );
