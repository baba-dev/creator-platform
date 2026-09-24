CREATE TABLE `NotificationPreference` (
  `userId` VARCHAR(191) NOT NULL,
  `generationCompleted` BOOLEAN NOT NULL DEFAULT true,
  `generationFailed` BOOLEAN NOT NULL DEFAULT true,
  `reports` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`userId`),
  CONSTRAINT `NotificationPreference_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
