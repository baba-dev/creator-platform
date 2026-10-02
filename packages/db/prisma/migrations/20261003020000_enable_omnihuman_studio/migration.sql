-- Enable OmniHuman 1.5 and publish its active price version for Digital Spokesperson Studio

UPDATE `ProviderModel`
SET `enabled` = 1,
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `provider` = 'BYTEPLUS'
  AND `providerModelId` = 'omnihuman-1.5';

INSERT INTO `ModelPriceVersion` (
  `id`, `providerModelId`, `providerCostMicroUsd`, `providerCostBasisNote`,
  `customerCredits`, `fxBaisaNumerator`, `fxBaisaDenominator`,
  `targetMarginBps`, `pricingDimension`, `unitQuantity`, `creditsPerBaisa`,
  `effectiveFrom`, `effectiveTo`, `createdById`, `createdAt`
)
SELECT
  'byteplusomnihuman15price20261003',
  model.`id`,
  120000,
  'Official BytePlus OmniHuman 1.5 rate: $0.12/second with 1-second billing unit.',
  63,
  769,
  2,
  2500,
  'SECOND',
  1,
  1,
  CURRENT_TIMESTAMP(3),
  NULL,
  actor.`id`,
  CURRENT_TIMESTAMP(3)
FROM `ProviderModel` model
JOIN `User` actor ON actor.`email` = 'system@aiwamediagroup.com'
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'omnihuman-1.5'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` activePrice
    WHERE activePrice.`providerModelId` = model.`id`
      AND activePrice.`effectiveTo` IS NULL
  );
