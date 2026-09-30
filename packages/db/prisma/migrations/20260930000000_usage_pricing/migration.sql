-- Additive: preserve every existing price/job snapshot and posted ledger entry.
ALTER TABLE `ModelPriceVersion`
  MODIFY `pricingDimension` ENUM('REQUEST', 'CHARACTER', 'SECOND', 'TOKEN') NOT NULL DEFAULT 'REQUEST',
  ADD COLUMN `usageRates` JSON NULL,
  ADD COLUMN `providerCostBasisNote` VARCHAR(255) NULL;
ALTER TABLE `GenerationJob` ADD COLUMN `providerCostBasis` VARCHAR(32) NULL;

ALTER TABLE `ModelPriceVersion` ADD COLUMN `publicationKey` VARCHAR(36) NULL, ADD COLUMN `publicationHash` VARCHAR(64) NULL, ADD UNIQUE INDEX `ModelPriceVersion_publicationKey_key` (`publicationKey`);
