-- Preserve deterministic ordering for multi-output generation assets.
ALTER TABLE `Asset`
  ADD COLUMN `generationOutputIndex` INTEGER NULL;

CREATE UNIQUE INDEX `Asset_generationJobId_generationOutputIndex_key`
  ON `Asset`(`generationJobId`, `generationOutputIndex`);

-- Existing one-output jobs become output index zero. Non-generated/reference
-- assets retain NULL so the unique index does not constrain unrelated assets.
UPDATE `Asset`
SET `generationOutputIndex` = 0
WHERE `generationJobId` IS NOT NULL
  AND `sourceType` = 'GENERATED'
  AND `generationOutputIndex` IS NULL;
