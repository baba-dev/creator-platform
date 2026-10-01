-- Add OmniHuman 1.5 to ProviderModel and seed active ModelPriceVersion ($0.12/s = 120,000 micro-USD)
INSERT INTO `ProviderModel` (
  `id`, `provider`, `providerModelId`, `mediaKind`, `displayName`,
  `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`,
  `createdAt`, `updatedAt`
) VALUES (
  'byteplus-omnihuman-1-5',
  'BYTEPLUS',
  'omnihuman-1.5',
  'VIDEO',
  'OmniHuman 1.5',
  'Film-grade digital humans, talking avatars, and spokesperson videos driven by speech audio and portrait images.',
  JSON_OBJECT(
    'aspectRatio:16:9', TRUE,
    'aspectRatio:9:16', TRUE,
    'aspectRatio:1:1', TRUE,
    'aspectRatio:adaptive', TRUE,
    'resolution:720p', TRUE,
    'resolution:1080p', TRUE,
    'durationSeconds:5', TRUE,
    'durationSeconds:10', TRUE,
    'durationSeconds:15', TRUE,
    'durationSeconds:30', TRUE,
    'durationSeconds:60', TRUE,
    'talkingAvatar', TRUE,
    'avatarImage', TRUE,
    'audioInput', TRUE,
    'firstFrame', TRUE,
    'prompt', TRUE,
    'minimumDurationSeconds', 2,
    'maximumDurationSeconds', 60,
    'fps', 25
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
  `negotiatedDiscountBps` = VALUES(`negotiatedDiscountBps`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `ModelPriceVersion` (
  `id`, `providerModelId`, `providerCostMicroUsd`, `providerCostBasisNote`,
  `customerCredits`, `fxBaisaNumerator`, `fxBaisaDenominator`,
  `targetMarginBps`, `pricingDimension`, `unitQuantity`, `creditsPerBaisa`,
  `effectiveFrom`, `effectiveTo`, `createdById`, `createdAt`
)
SELECT
  'byteplusomnihuman15price20261002',
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
