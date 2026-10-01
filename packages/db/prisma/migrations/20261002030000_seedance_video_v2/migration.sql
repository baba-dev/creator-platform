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
