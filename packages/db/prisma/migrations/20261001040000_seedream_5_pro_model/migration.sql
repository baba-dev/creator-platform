-- Ensure seeded Seedream 5.0 Pro model exists with enabled status and verified capabilities
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
  'byteplus-seedream-5-pro',
  'BYTEPLUS',
  'dola-seedream-5-0-pro-260628',
  'IMAGE',
  'Seedream 5.0 Pro',
  'Professional foundation generation, interactive bounding-box editing, and layer separation.',
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
    'maxReferenceImages', 10,
    'sequentialImages', TRUE,
    'maxGeneratedImages', 15,
    'maxTotalInputOutputImages', 15,
    'preciseEditing', TRUE,
    'inpainting', TRUE,
    'outpainting', TRUE,
    'objectReplacement', TRUE,
    'layerSeparation', TRUE
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

-- Map any legacy unversioned seedream-5-0-pro row if present
UPDATE `ProviderModel` AS legacy
LEFT JOIN `ProviderModel` AS canonical
  ON canonical.`provider` = legacy.`provider`
  AND canonical.`providerModelId` = 'dola-seedream-5-0-pro-260628'
SET legacy.`providerModelId` = 'dola-seedream-5-0-pro-260628'
WHERE legacy.`provider` = 'BYTEPLUS'
  AND legacy.`providerModelId` IN ('seedream-5-0-pro', 'seedream-5-pro')
  AND canonical.`id` IS NULL;

-- Create an active price version for Seedream 5.0 Pro if one does not exist
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
  'byteplusseedream5proprice20261001',
  model.`id`,
  40500,
  22,
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
  AND model.`providerModelId` = 'dola-seedream-5-0-pro-260628'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` activePrice
    WHERE activePrice.`providerModelId` = model.`id`
      AND activePrice.`effectiveTo` IS NULL
  );
