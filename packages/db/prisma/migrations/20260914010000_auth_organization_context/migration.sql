-- AlterTable
ALTER TABLE `Organization`
    ADD COLUMN `selfServeCreatorUserId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Session`
    ADD COLUMN `activeOrganizationId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Organization_selfServeCreatorUserId_key`
    ON `Organization`(`selfServeCreatorUserId`);

-- CreateIndex
CREATE INDEX `Session_activeOrganizationId_idx`
    ON `Session`(`activeOrganizationId`);

-- AddForeignKey
ALTER TABLE `Organization`
    ADD CONSTRAINT `Organization_selfServeCreatorUserId_fkey`
    FOREIGN KEY (`selfServeCreatorUserId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session`
    ADD CONSTRAINT `Session_activeOrganizationId_fkey`
    FOREIGN KEY (`activeOrganizationId`) REFERENCES `Organization`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
