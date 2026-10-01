-- Preserve an existing legacy Seedream 4.0 row before creating the canonical model.
-- This keeps the legacy primary key, pricing history and generation-job relationships.
UPDATE `ProviderModel` AS legacy
LEFT JOIN `ProviderModel` AS canonical
  ON canonical.`provider` = legacy.`provider`
  AND canonical.`providerModelId` = 'seedream-4-0-250828'
SET legacy.`providerModelId` = 'seedream-4-0-250828'
WHERE legacy.`provider` = 'BYTEPLUS'
  AND legacy.`providerModelId` = 'seedream-4-0'
  AND canonical.`id` IS NULL;

-- Ensure Seedream 4.0 exists with verified capabilities. ON DUPLICATE KEY
-- intentionally does not replace the primary key or enabled state of a legacy row.
INSERT INTO `ProviderModel` (
  `id`,
  `provider`,
  `providerModelId`,
  `mediaKind`,
  `displayName`,
  `description`,
  `capabilities`,
  `negotiatedDiscountBps`,
  `enabled`,
  `createdAt`,
  `updatedAt`
) VALUES (
  'byteplus-seedream-4-0',
  'BYTEPLUS',
  'seedream-4-0-250828',
  'IMAGE',
  'Seedream 4.0',
  'Versatile foundation image generation with balanced styling and prompt fidelity.',
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
    'resolution:2K', TRUE,
    'resolution:4K', TRUE,
    'referenceImages', TRUE,
    'maxReferenceImages', 14,
    'sequentialImages', TRUE,
    'maxGeneratedImages', 15,
    'maxTotalInputOutputImages', 15
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

-- Seed the verified AIWA account rate only when no active price exists.
-- Public list price is $0.030/image; the verified 10% account discount is $0.027.
INSERT INTO `ModelPriceVersion` (
  `id`,
  `providerModelId`,
  `providerCostMicroUsd`,
  `providerCostBasisNote`,
  `customerCredits`,
  `fxBaisaNumerator`,
  `fxBaisaDenominator`,
  `targetMarginBps`,
  `pricingDimension`,
  `unitQuantity`,
  `creditsPerBaisa`,
  `effectiveFrom`,
  `effectiveTo`,
  `createdById`,
  `createdAt`
)
SELECT
  'byteplusseedream40price20261001',
  model.`id`,
  27000,
  'Verified AIWA BytePlus Seedream 4.0 rate: 10% off the $0.030/image public list price.',
  15,
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
  AND model.`providerModelId` = 'seedream-4-0-250828'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` activePrice
    WHERE activePrice.`providerModelId` = model.`id`
      AND activePrice.`effectiveTo` IS NULL
  );
