CREATE TABLE `WebPushSubscription` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `endpointHash` VARCHAR(64) NOT NULL,
  `p256dh` VARCHAR(255) NOT NULL,
  `auth` VARCHAR(255) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WebPushSubscription_endpointHash_key`(`endpointHash`),
  INDEX `WebPushSubscription_userId_idx`(`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `WebPushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebPushDelivery` (
  `id` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `lastAttemptAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WebPushDelivery_subscriptionId_jobId_key`(`subscriptionId`, `jobId`),
  INDEX `WebPushDelivery_status_lastAttemptAt_idx`(`status`, `lastAttemptAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `WebPushDelivery_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `WebPushSubscription`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
