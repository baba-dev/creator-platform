CREATE TABLE `Passkey` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NULL,
  `publicKey` TEXT NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `credentialID` VARCHAR(512) NOT NULL,
  `counter` INTEGER NOT NULL,
  `deviceType` VARCHAR(191) NOT NULL,
  `backedUp` BOOLEAN NOT NULL,
  `transports` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `aaguid` VARCHAR(191) NULL,
  UNIQUE INDEX `Passkey_credentialID_key`(`credentialID`),
  INDEX `Passkey_userId_idx`(`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Passkey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
