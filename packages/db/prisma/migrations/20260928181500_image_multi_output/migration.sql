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


-- Existing environments must expose sequential-output limits immediately.
UPDATE `ProviderModel`
SET `capabilities` = JSON_MERGE_PATCH(
  COALESCE(`capabilities`, JSON_OBJECT()),
  JSON_OBJECT(
    'sequentialImages', TRUE,
    'maxGeneratedImages', 15,
    'maxTotalInputOutputImages', 15
  )
)
WHERE `provider` = 'BYTEPLUS'
  AND `providerModelId` IN ('seedream-5-0-260128', 'seedream-4-5-251128')
  AND `mediaKind` = 'IMAGE';
