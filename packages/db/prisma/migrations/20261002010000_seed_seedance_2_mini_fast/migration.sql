-- Seedance 2.0 Fast
INSERT INTO `ProviderModel` (
  `id`, `provider`, `providerModelId`, `mediaKind`, `displayName`,
  `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`,
  `createdAt`, `updatedAt`
) VALUES (
  'byteplus-seedance-2-fast',
  'BYTEPLUS',
  'dreamina-seedance-2-0-fast-260128',
  'VIDEO',
  'Seedance 2.0 Fast',
  'High-speed video generation balancing quality and low latency for reference-guided iterations.',
  JSON_OBJECT(
    'aspectRatio:16:9', TRUE,
    'aspectRatio:9:16', TRUE,
    'aspectRatio:1:1', TRUE,
    'aspectRatio:4:3', TRUE,
    'aspectRatio:3:4', TRUE,
    'aspectRatio:21:9', TRUE,
    'aspectRatio:adaptive', TRUE,
    'resolution:480p', TRUE,
    'resolution:720p', TRUE,
    'durationSeconds:5', TRUE,
    'durationSeconds:10', TRUE,
    'generateAudio', TRUE,
    'firstFrame', TRUE,
    'lastFrame', TRUE,
    'referenceVideo', TRUE
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

INSERT INTO `ModelPriceVersion` (
  `id`, `providerModelId`, `providerCostMicroUsd`, `usageRates`,
  `providerCostBasisNote`, `customerCredits`, `fxBaisaNumerator`,
  `fxBaisaDenominator`, `targetMarginBps`, `pricingDimension`, `unitQuantity`,
  `creditsPerBaisa`, `effectiveFrom`, `effectiveTo`, `createdById`, `createdAt`
)
SELECT
  'seedance2fastprice20261002',
  model.`id`,
  5600,
  JSON_OBJECT(
    'estimator', 'byteplus-video-v1',
    'rates', JSON_ARRAY(
      JSON_OBJECT('resolution', '480p', 'workflow', 'GENERATE', 'microUsdPerThousandTokens', '5600'),
      JSON_OBJECT('resolution', '720p', 'workflow', 'GENERATE', 'microUsdPerThousandTokens', '5600'),
      JSON_OBJECT('resolution', '480p', 'workflow', 'VIDEO_INPUT', 'microUsdPerThousandTokens', '3300'),
      JSON_OBJECT('resolution', '720p', 'workflow', 'VIDEO_INPUT', 'microUsdPerThousandTokens', '3300')
    )
  ),
  'BytePlus Seedance 2.0 Fast token pricing ($5.60/M generation, $3.30/M video input).',
  0,
  769,
  2,
  2500,
  'TOKEN',
  1000,
  1,
  CURRENT_TIMESTAMP(3),
  NULL,
  actor.`id`,
  CURRENT_TIMESTAMP(3)
FROM `ProviderModel` model
JOIN `User` actor ON actor.`email` = 'system@aiwamediagroup.com'
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'dreamina-seedance-2-0-fast-260128'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` activePrice
    WHERE activePrice.`providerModelId` = model.`id`
      AND activePrice.`effectiveTo` IS NULL
  );

-- Seedance 2.0 Mini
INSERT INTO `ProviderModel` (
  `id`, `provider`, `providerModelId`, `mediaKind`, `displayName`,
  `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`,
  `createdAt`, `updatedAt`
) VALUES (
  'byteplus-seedance-2-mini',
  'BYTEPLUS',
  'dreamina-seedance-2-0-mini-260615',
  'VIDEO',
  'Seedance 2.0 Mini',
  'Cost-optimized fast video generation designed for previews, variants, and concept exploration.',
  JSON_OBJECT(
    'aspectRatio:16:9', TRUE,
    'aspectRatio:9:16', TRUE,
    'aspectRatio:1:1', TRUE,
    'aspectRatio:4:3', TRUE,
    'aspectRatio:3:4', TRUE,
    'aspectRatio:21:9', TRUE,
    'aspectRatio:adaptive', TRUE,
    'resolution:480p', TRUE,
    'resolution:720p', TRUE,
    'durationSeconds:5', TRUE,
    'durationSeconds:10', TRUE,
    'generateAudio', TRUE,
    'firstFrame', TRUE,
    'lastFrame', TRUE,
    'referenceVideo', TRUE
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

INSERT INTO `ModelPriceVersion` (
  `id`, `providerModelId`, `providerCostMicroUsd`, `usageRates`,
  `providerCostBasisNote`, `customerCredits`, `fxBaisaNumerator`,
  `fxBaisaDenominator`, `targetMarginBps`, `pricingDimension`, `unitQuantity`,
  `creditsPerBaisa`, `effectiveFrom`, `effectiveTo`, `createdById`, `createdAt`
)
SELECT
  'seedance2miniprice20261002',
  model.`id`,
  3500,
  JSON_OBJECT(
    'estimator', 'byteplus-video-v1',
    'rates', JSON_ARRAY(
      JSON_OBJECT('resolution', '480p', 'workflow', 'GENERATE', 'microUsdPerThousandTokens', '3500'),
      JSON_OBJECT('resolution', '720p', 'workflow', 'GENERATE', 'microUsdPerThousandTokens', '3500'),
      JSON_OBJECT('resolution', '480p', 'workflow', 'VIDEO_INPUT', 'microUsdPerThousandTokens', '2100'),
      JSON_OBJECT('resolution', '720p', 'workflow', 'VIDEO_INPUT', 'microUsdPerThousandTokens', '2100')
    )
  ),
  'BytePlus Seedance 2.0 Mini token pricing ($3.50/M generation, $2.10/M video input).',
  0,
  769,
  2,
  2500,
  'TOKEN',
  1000,
  1,
  CURRENT_TIMESTAMP(3),
  NULL,
  actor.`id`,
  CURRENT_TIMESTAMP(3)
FROM `ProviderModel` model
JOIN `User` actor ON actor.`email` = 'system@aiwamediagroup.com'
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'dreamina-seedance-2-0-mini-260615'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` activePrice
    WHERE activePrice.`providerModelId` = model.`id`
      AND activePrice.`effectiveTo` IS NULL
  );
