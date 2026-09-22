-- AlterTable ModelPriceVersion
ALTER TABLE `ModelPriceVersion`
  ADD COLUMN `pricingDimension` ENUM('REQUEST', 'CHARACTER') NOT NULL DEFAULT 'REQUEST',
  ADD COLUMN `unitQuantity` INTEGER NOT NULL DEFAULT 1;

-- AlterTable GenerationJob
ALTER TABLE `GenerationJob`
  ADD COLUMN `quotedUnits` INTEGER NULL,
  ADD COLUMN `actualUnits` INTEGER NULL,
  ADD COLUMN `billableQuantity` INTEGER NULL;

-- Ensure seeded Seed Speech TTS 2.0 model exists with enabled status and verified capabilities
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
  'byteplus-seed-tts-2-0',
  'BYTEPLUS',
  'seed-tts-2.0',
  'VOICE',
  'Seed Speech TTS 2.0',
  'Expressive, context-aware narration returned as synthesized audio bytes.',
  JSON_OBJECT(
    'streaming', TRUE,
    'format:mp3', TRUE,
    'format:ogg_opus', TRUE,
    'format:pcm', TRUE,
    'sampleRate:24000', TRUE,
    'speechRate:min', -50,
    'speechRate:max', 100
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

-- Migrations are the production deployment path, so create the system actor
-- and an active per-1,000-character price without requiring a separate seed.
INSERT INTO `User` (
  `id`, `name`, `email`, `emailVerified`, `platformRole`, `createdAt`, `updatedAt`
) VALUES (
  'creatorplatformsystemuser',
  'Aiwa System',
  'system@aiwamediagroup.com',
  TRUE,
  'PLATFORM_OWNER',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
) ON DUPLICATE KEY UPDATE
  `updatedAt` = `updatedAt`;

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
  'byteplusseedtts20price20260922',
  model.`id`,
  30000,
  16,
  769,
  2,
  2500,
  'CHARACTER',
  1000,
  CURRENT_TIMESTAMP(3),
  NULL,
  actor.`id`,
  CURRENT_TIMESTAMP(3)
FROM `ProviderModel` model
JOIN `User` actor ON actor.`email` = 'system@aiwamediagroup.com'
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'seed-tts-2.0'
  AND NOT EXISTS (
    SELECT 1
    FROM `ModelPriceVersion` activePrice
    WHERE activePrice.`providerModelId` = model.`id`
      AND activePrice.`effectiveTo` IS NULL
  );
