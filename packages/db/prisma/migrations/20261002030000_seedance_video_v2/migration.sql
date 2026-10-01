-- Seedance 2.x multimodal input roles.
-- Additive only: historical rows are classified as LEGACY and remain processable.

ALTER TABLE `GenerationInputAsset`
  ADD COLUMN `role` ENUM(
    'LEGACY',
    'FIRST_FRAME',
    'LAST_FRAME',
    'REFERENCE_IMAGE',
    'REFERENCE_VIDEO',
    'REFERENCE_AUDIO',
    'SOURCE_VIDEO'
  ) NOT NULL DEFAULT 'LEGACY';

CREATE INDEX `GenerationInputAsset_generationJobId_role_position_idx`
  ON `GenerationInputAsset`(`generationJobId`, `role`, `position`);

-- Keep the production provider catalog aligned during prisma migrate deploy.
-- New models are inserted disabled and unpriced; an administrator must publish
-- an immutable price version before enabling them. Existing model enabled state
-- is deliberately preserved by the duplicate-key update.

INSERT INTO `ProviderModel` (`id`, `provider`, `providerModelId`, `mediaKind`, `displayName`, `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`, `createdAt`, `updatedAt`)
VALUES ('byteplus-seedance-2-0-mini', 'BYTEPLUS', 'dreamina-seedance-2-0-mini-260615', 'VIDEO', 'Seedance 2.0 Mini', 'Cost-efficient Seedance video generation for drafts, iteration, references, editing and extension.', '{"aspectRatio:16:9":true,"aspectRatio:9:16":true,"aspectRatio:1:1":true,"aspectRatio:4:3":true,"aspectRatio:3:4":true,"aspectRatio:21:9":true,"aspectRatio:adaptive":true,"resolution:480p":true,"resolution:720p":true,"generateAudio":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"maxReferenceImages":9,"maxReferenceVideos":3,"maxReferenceAudio":3,"maxReferenceVideoDurationSeconds":15,"maxReferenceAudioDurationSeconds":15,"audioOnlyReference":false,"editVideo":true,"extendVideo":true,"draftMode":false,"outputFormatMov":false,"returnLastFrame":true,"minimumDurationSeconds":4,"maximumDurationSeconds":15,"fps":24,"concurrencyLimit":10}', 0, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `mediaKind` = VALUES(`mediaKind`),
  `displayName` = VALUES(`displayName`),
  `description` = VALUES(`description`),
  `capabilities` = VALUES(`capabilities`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `ProviderModel` (`id`, `provider`, `providerModelId`, `mediaKind`, `displayName`, `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`, `createdAt`, `updatedAt`)
VALUES ('byteplus-seedance-2-0-fast', 'BYTEPLUS', 'dreamina-seedance-2-0-fast-260128', 'VIDEO', 'Seedance 2.0 Fast', 'Fast Seedance iteration with multimodal references, synchronized audio, editing and extension.', '{"aspectRatio:16:9":true,"aspectRatio:9:16":true,"aspectRatio:1:1":true,"aspectRatio:4:3":true,"aspectRatio:3:4":true,"aspectRatio:21:9":true,"aspectRatio:adaptive":true,"resolution:480p":true,"resolution:720p":true,"generateAudio":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"maxReferenceImages":9,"maxReferenceVideos":3,"maxReferenceAudio":3,"maxReferenceVideoDurationSeconds":15,"maxReferenceAudioDurationSeconds":15,"audioOnlyReference":false,"editVideo":true,"extendVideo":true,"draftMode":false,"outputFormatMov":false,"returnLastFrame":true,"minimumDurationSeconds":4,"maximumDurationSeconds":15,"fps":24,"concurrencyLimit":10}', 0, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `mediaKind` = VALUES(`mediaKind`),
  `displayName` = VALUES(`displayName`),
  `description` = VALUES(`description`),
  `capabilities` = VALUES(`capabilities`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `ProviderModel` (`id`, `provider`, `providerModelId`, `mediaKind`, `displayName`, `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`, `createdAt`, `updatedAt`)
VALUES ('byteplus-seedance-2-0', 'BYTEPLUS', 'dreamina-seedance-2-0-260128', 'VIDEO', 'Seedance 2.0', 'Production Seedance video generation with 1080p/4K output, references, editing and extension.', '{"aspectRatio:16:9":true,"aspectRatio:9:16":true,"aspectRatio:1:1":true,"aspectRatio:4:3":true,"aspectRatio:3:4":true,"aspectRatio:21:9":true,"aspectRatio:adaptive":true,"resolution:480p":true,"resolution:720p":true,"resolution:1080p":true,"resolution:4K":true,"generateAudio":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"maxReferenceImages":9,"maxReferenceVideos":3,"maxReferenceAudio":3,"maxReferenceVideoDurationSeconds":15,"maxReferenceAudioDurationSeconds":15,"audioOnlyReference":false,"editVideo":true,"extendVideo":true,"draftMode":false,"outputFormatMov":false,"returnLastFrame":true,"minimumDurationSeconds":4,"maximumDurationSeconds":15,"fps":24,"concurrencyLimit":10,"concurrencyLimit4K":1}', 0, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `mediaKind` = VALUES(`mediaKind`),
  `displayName` = VALUES(`displayName`),
  `description` = VALUES(`description`),
  `capabilities` = VALUES(`capabilities`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `ProviderModel` (`id`, `provider`, `providerModelId`, `mediaKind`, `displayName`, `description`, `capabilities`, `negotiatedDiscountBps`, `enabled`, `createdAt`, `updatedAt`)
VALUES ('byteplus-seedance-2-5', 'BYTEPLUS', 'dreamina-seedance-2-5-260628', 'VIDEO', 'Seedance 2.5', 'Director-grade 30-second multimodal video generation, Draft review, editing and extension.', '{"aspectRatio:16:9":true,"aspectRatio:9:16":true,"aspectRatio:1:1":true,"aspectRatio:4:3":true,"aspectRatio:3:4":true,"aspectRatio:21:9":true,"aspectRatio:adaptive":true,"resolution:480p":true,"resolution:720p":true,"resolution:1080p":true,"generateAudio":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"maxReferenceImages":30,"maxReferenceVideos":10,"maxReferenceAudio":10,"maxReferenceVideoDurationSeconds":30,"maxReferenceAudioDurationSeconds":30,"audioOnlyReference":true,"editVideo":true,"extendVideo":true,"draftMode":true,"outputFormatMov":true,"returnLastFrame":true,"minimumDurationSeconds":4,"maximumDurationSeconds":30,"fps":24,"concurrencyLimit":10}', 0, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `mediaKind` = VALUES(`mediaKind`),
  `displayName` = VALUES(`displayName`),
  `description` = VALUES(`description`),
  `capabilities` = VALUES(`capabilities`),
  `updatedAt` = CURRENT_TIMESTAMP(3);
