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
  `enabled` = TRUE,
  `updatedAt` = CURRENT_TIMESTAMP(3);
