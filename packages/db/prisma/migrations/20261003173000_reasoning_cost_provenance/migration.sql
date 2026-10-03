-- Add immutable pricing provenance and provider-cost observability to reasoning jobs.
-- Historical jobs remain valid with NULL pricing/cost fields. New prompt-enhancement
-- admission pins an active ModelPriceVersion before queueing.
ALTER TABLE `ReasoningJob`
  ADD COLUMN `priceVersionId` VARCHAR(191) NULL AFTER `providerModelId`,
  ADD COLUMN `estimatedProviderCostMicroUsd` BIGINT NULL AFTER `outputTokens`,
  ADD COLUMN `actualProviderCostMicroUsd` BIGINT NULL AFTER `estimatedProviderCostMicroUsd`,
  ADD COLUMN `providerCostBasis` VARCHAR(32) NULL AFTER `actualProviderCostMicroUsd`,
  ADD INDEX `ReasoningJob_priceVersionId_idx` (`priceVersionId`);

ALTER TABLE `ReasoningJob`
  ADD CONSTRAINT `ReasoningJob_priceVersionId_fkey`
  FOREIGN KEY (`priceVersionId`) REFERENCES `ModelPriceVersion`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The Cloudflare Llama row predates task-aware prompt enhancement. Normalize the
-- persisted catalog capability so existing deployments discover it immediately;
-- future model syncs carry the same capability from the verified catalog.
UPDATE `ProviderModel`
SET `capabilities` = JSON_SET(
  COALESCE(`capabilities`, JSON_OBJECT()),
  '$."task:prompt-enhancement"',
  JSON_EXTRACT('true', '$')
)
WHERE `provider` = 'CLOUDFLARE'
  AND `providerModelId` = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
