-- OmniHuman 1.5 V2 talking-avatar source roles and catalog registration.
-- Additive and deployment-safe: the model is inserted disabled and unpriced.

ALTER TABLE `GenerationInputAsset`
  MODIFY COLUMN `role` ENUM(
    'LEGACY',
    'FIRST_FRAME',
    'LAST_FRAME',
    'REFERENCE_IMAGE',
    'REFERENCE_VIDEO',
    'REFERENCE_AUDIO',
    'SOURCE_VIDEO',
    'AVATAR_IMAGE',
    'DRIVING_AUDIO'
  ) NOT NULL DEFAULT 'LEGACY';

INSERT INTO `ProviderModel`
  (`id`, `provider`, `providerModelId`, `mediaKind`, `displayName`,
   `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`,
   `createdAt`, `updatedAt`)
VALUES
  (
    'byteplus-omnihuman-1-5',
    'BYTEPLUS',
    'omnihuman-1.5',
    'VIDEO',
    'OmniHuman 1.5',
    'Expressive talking-avatar video from one portrait image and a driving audio track.',
    '{"aspectRatio:adaptive":true,"resolution:720p":true,"resolution:1080p":true,"talkingAvatar":true,"avatarImage":true,"audioInput":true,"outputFormatMov":false,"returnLastFrame":false,"maximumDurationSeconds":60,"concurrencyLimit":1,"providerTransport":"vision"}',
    0,
    0,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  )
ON DUPLICATE KEY UPDATE
  `mediaKind` = VALUES(`mediaKind`),
  `displayName` = VALUES(`displayName`),
  `description` = VALUES(`description`),
  `capabilities` = VALUES(`capabilities`),
  `updatedAt` = CURRENT_TIMESTAMP(3);
