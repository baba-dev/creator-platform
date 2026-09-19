-- AddColumn rejectionReason, reversalReason, creditsGranted, creditsPerBaisa, idempotencyKey to ManualPayment
ALTER TABLE `ManualPayment`
  ADD COLUMN `rejectionReason`         TEXT NULL,
  ADD COLUMN `rejectionIdempotencyKey` VARCHAR(191) NULL,
  ADD COLUMN `reversalReason`          TEXT NULL,
  ADD COLUMN `creditsGranted`  BIGINT NULL,
  ADD COLUMN `creditsPerBaisa` BIGINT NULL,
  ADD COLUMN `idempotencyKey`  VARCHAR(191) NOT NULL DEFAULT '';

-- Back-fill existing rows so unique constraint can be applied
UPDATE `ManualPayment` SET `idempotencyKey` = CONCAT('legacy-', `id`) WHERE `idempotencyKey` = '';

-- Remove the temporary backfill default so the database matches schema.prisma
ALTER TABLE `ManualPayment` ALTER COLUMN `idempotencyKey` DROP DEFAULT;

-- Enforce operation idempotency
CREATE UNIQUE INDEX `ManualPayment_idempotencyKey_key` ON `ManualPayment`(`idempotencyKey`);
CREATE UNIQUE INDEX `ManualPayment_rejectionIdempotencyKey_key` ON `ManualPayment`(`rejectionIdempotencyKey`);
