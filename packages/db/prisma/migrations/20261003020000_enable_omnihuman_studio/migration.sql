-- Enable OmniHuman 1.5 and publish its active price version for Digital Spokesperson Studio.
-- The migration is deterministic: it closes any prior active OmniHuman price only when
-- an actor and model are available, then publishes the intended 2026-10-03 version.

UPDATE `ProviderModel`
SET `enabled` = 1,
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `provider` = 'BYTEPLUS'
  AND `providerModelId` = 'omnihuman-1.5';

UPDATE `ModelPriceVersion` activePrice
JOIN `ProviderModel` model
  ON model.`id` = activePrice.`providerModelId`
JOIN (
  SELECT `id`
  FROM `User`
  ORDER BY
    (`email` = 'system@aiwamediagroup.com') DESC,
    (`platformRole` = 'PLATFORM_OWNER') DESC,
    `createdAt` ASC
  LIMIT 1
) actor ON 1 = 1
SET activePrice.`effectiveTo` = CURRENT_TIMESTAMP(3)
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'omnihuman-1.5'
  AND activePrice.`effectiveTo` IS NULL
  AND activePrice.`id` <> 'byteplusomnihuman15price20261003';

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
JOIN (
  SELECT `id`
  FROM `User`
  ORDER BY
    (`email` = 'system@aiwamediagroup.com') DESC,
    (`platformRole` = 'PLATFORM_OWNER') DESC,
    `createdAt` ASC
  LIMIT 1
) actor ON 1 = 1
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'omnihuman-1.5'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` existing
    WHERE existing.`id` = 'byteplusomnihuman15price20261003'
  );
