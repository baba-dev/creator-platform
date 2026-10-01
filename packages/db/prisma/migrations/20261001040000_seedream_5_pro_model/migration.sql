-- Preserve an existing legacy Seedream 5.0 Pro row before creating the canonical model.
-- This keeps the primary key, pricing history, enabled state, and generation-job relationships.
UPDATE `ProviderModel` AS legacy
LEFT JOIN `ProviderModel` AS canonical
  ON canonical.`provider` = legacy.`provider`
  AND canonical.`providerModelId` = 'dola-seedream-5-0-pro-260628'
SET legacy.`providerModelId` = 'dola-seedream-5-0-pro-260628'
WHERE legacy.`provider` = 'BYTEPLUS'
  AND legacy.`providerModelId` IN (
    'seedream-5-0-pro',
    'seedream-5-0-pro-260628',
    'seedream-5-pro'
  )
  AND canonical.`id` IS NULL;

INSERT INTO `ProviderModel` (
  `id`, `provider`, `providerModelId`, `mediaKind`, `displayName`,
  `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`,
  `createdAt`, `updatedAt`
) VALUES (
  'byteplus-seedream-5-pro',
  'BYTEPLUS',
  'dola-seedream-5-0-pro-260628',
  'IMAGE',
  'Seedream 5.0 Pro',
  'High-quality image generation and coordinate-guided precision editing.',
  JSON_OBJECT(
    'aspectRatio:1:1', TRUE,
    'aspectRatio:4:3', TRUE,
    'aspectRatio:3:4', TRUE,
    'aspectRatio:16:9', TRUE,
    'aspectRatio:9:16', TRUE,
    'aspectRatio:3:2', TRUE,
    'aspectRatio:2:3', TRUE,
    'aspectRatio:21:9', TRUE,
    'resolution:1K', TRUE,
    'resolution:1.5K', TRUE,
    'resolution:2K', TRUE,
    'referenceImages', TRUE,
    'maxReferenceImages', 10,
    'sequentialImages', FALSE,
    'maxGeneratedImages', 1,
    'maxTotalInputOutputImages', 11,
    'preciseEditing', TRUE,
    'inpainting', TRUE,
    'outpainting', TRUE,
    'objectReplacement', TRUE
  ),
  1000,
  TRUE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
) ON DUPLICATE KEY UPDATE
  `displayName` = VALUES(`displayName`),
  `description` = VALUES(`description`),
  `mediaKind` = VALUES(`mediaKind`),
  `capabilities` = VALUES(`capabilities`),
  `negotiatedDiscountBps` = VALUES(`negotiatedDiscountBps`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

-- Base price is the verified discounted <=1.5K output rate. Runtime pricing
-- derives 2K as 2x base and each additional input after the first as 1/15th of base.
INSERT INTO `ModelPriceVersion` (
  `id`, `providerModelId`, `providerCostMicroUsd`, `providerCostBasisNote`,
  `customerCredits`, `fxBaisaNumerator`, `fxBaisaDenominator`,
  `targetMarginBps`, `pricingDimension`, `unitQuantity`, `creditsPerBaisa`,
  `effectiveFrom`, `effectiveTo`, `createdById`, `createdAt`
)
SELECT
  'byteplusseedream5proprice20261001',
  model.`id`,
  40500,
  'Verified AIWA BytePlus Seedream 5.0 Pro rate: 10% discount, with base at <=1.5K output. 2K is 2x and additional inputs after the first are 1/15th of base.',
  22,
  769,
  2,
  2500,
  'REQUEST',
  1,
  1,
  CURRENT_TIMESTAMP(3),
  NULL,
  actor.`id`,
  CURRENT_TIMESTAMP(3)
FROM `ProviderModel` model
JOIN `User` actor ON actor.`email` = 'system@aiwamediagroup.com'
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'dola-seedream-5-0-pro-260628'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` activePrice
    WHERE activePrice.`providerModelId` = model.`id`
      AND activePrice.`effectiveTo` IS NULL
  );
