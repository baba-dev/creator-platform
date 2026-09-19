-- AddColumn rejectionReason, reversalReason, creditsGranted, creditsPerBaisa, idempotencyKey to ManualPayment
ALTER TABLE `ManualPayment`
  ADD COLUMN `rejectionReason` TEXT NULL,
  ADD COLUMN `reversalReason`  TEXT NULL,
  ADD COLUMN `creditsGranted`  BIGINT NULL,
  ADD COLUMN `creditsPerBaisa` BIGINT NULL,
  ADD COLUMN `idempotencyKey`  VARCHAR(191) NOT NULL DEFAULT '';

-- Back-fill existing rows so unique constraint can be applied
UPDATE `ManualPayment` SET `idempotencyKey` = CONCAT('legacy-', `id`) WHERE `idempotencyKey` = '';

-- Enforce uniqueness
CREATE UNIQUE INDEX `ManualPayment_idempotencyKey_key` ON `ManualPayment`(`idempotencyKey`);

-- Enforce index on idempotencyKey (covered by the unique index above)
