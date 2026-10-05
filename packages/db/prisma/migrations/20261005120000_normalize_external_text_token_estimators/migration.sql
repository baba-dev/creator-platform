-- Normalize external text provider usage rate estimators and backfill missing rate tables for token-priced text models

-- 1. Migrate external text models that stored legacy byteplus-text-v1 estimator
UPDATE `ModelPriceVersion` AS `mpv`
JOIN `ProviderModel` AS `pm` ON `mpv`.`providerModelId` = `pm`.`id`
SET `mpv`.`usageRates` = JSON_SET(`mpv`.`usageRates`, '$.estimator', 'text-token-v1')
WHERE `pm`.`provider` IN ('GEMINI', 'GROQ', 'CLOUDFLARE', 'NVIDIA')
  AND `mpv`.`usageRates` IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(`mpv`.`usageRates`, '$.estimator')) = 'byteplus-text-v1';

-- 2. Backfill default rate table for any active or historical token-priced text price version missing usageRates
UPDATE `ModelPriceVersion` AS `mpv`
JOIN `ProviderModel` AS `pm` ON `mpv`.`providerModelId` = `pm`.`id`
SET `mpv`.`usageRates` = JSON_OBJECT(
  'estimator', IF(`pm`.`provider` = 'BYTEPLUS', 'byteplus-text-v1', 'text-token-v1'),
  'tiers', JSON_ARRAY(
    JSON_OBJECT(
      'maxPromptTokens', 262144,
      'inputMicroUsdPerMillionTokens', CAST(`mpv`.`providerCostMicroUsd` * 1000 AS CHAR),
      'cachedInputMicroUsdPerMillionTokens', CAST(`mpv`.`providerCostMicroUsd` * 1000 AS CHAR),
      'outputMicroUsdPerMillionTokens', CAST(`mpv`.`providerCostMicroUsd` * 1000 AS CHAR)
    )
  )
)
WHERE `pm`.`mediaKind` = 'TEXT'
  AND `mpv`.`pricingDimension` = 'TOKEN'
  AND `mpv`.`usageRates` IS NULL;
