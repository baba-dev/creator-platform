-- Ensure seeded Seedream 4.0 model exists with enabled status and verified capabilities
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
    'resolution:2K', TRUE,
    'resolution:4K', TRUE,
    'referenceImages', TRUE,
    'maxReferenceImages', 14,
    'sequentialImages', TRUE,
    'maxGeneratedImages', 15,
    'maxTotalInputOutputImages', 15
  ),
  0,
  TRUE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
) ON DUPLICATE KEY UPDATE
  `displayName` = VALUES(`displayName`),
  `description` = VALUES(`description`),
  `mediaKind` = VALUES(`mediaKind`),
  `capabilities` = VALUES(`capabilities`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

-- Map any legacy unversioned seedream-4-0 row if present
UPDATE `ProviderModel` AS legacy
LEFT JOIN `ProviderModel` AS canonical
  ON canonical.`provider` = legacy.`provider`
  AND canonical.`providerModelId` = 'seedream-4-0-250828'
SET legacy.`providerModelId` = 'seedream-4-0-250828'
WHERE legacy.`provider` = 'BYTEPLUS'
  AND legacy.`providerModelId` = 'seedream-4-0'
  AND canonical.`id` IS NULL;

-- Create an active price version for Seedream 4.0 if one does not exist
INSERT INTO `ModelPriceVersion` (
  `id`,
  `providerModelId`,
  `providerCostMicroUsd`,
  `customerCredits`,
  `fxBaisaNumerator`,
  `fxBaisaDenominator`,
  `targetMarginBps`,
  `pricingDimension`,
  `unitQuantity`,
  `effectiveFrom`,
  `effectiveTo`,
  `createdById`,
  `createdAt`
)
SELECT
  'byteplusseedream40price20261001',
  model.`id`,
  28000,
  15,
  769,
  2,
  2500,
  'REQUEST',
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
