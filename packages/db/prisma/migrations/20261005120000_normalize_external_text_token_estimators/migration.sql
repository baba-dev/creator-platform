-- Normalize legacy estimator labels on currently-active external TEXT token prices.
-- Historical price snapshots remain immutable. Legacy active rows with NULL
-- usageRates continue through the fixed-unit TOKEN compatibility path until an
-- administrator publishes an explicit provider rate table.

UPDATE `ModelPriceVersion` AS `mpv`
JOIN `ProviderModel` AS `pm` ON `mpv`.`providerModelId` = `pm`.`id`
SET `mpv`.`usageRates` = JSON_SET(
  `mpv`.`usageRates`,
  '$.estimator',
  'text-token-v1'
)
WHERE `pm`.`provider` IN ('GEMINI', 'GROQ', 'CLOUDFLARE', 'NVIDIA')
  AND `pm`.`mediaKind` = 'TEXT'
  AND `mpv`.`pricingDimension` = 'TOKEN'
  AND `mpv`.`effectiveFrom` <= CURRENT_TIMESTAMP(3)
  AND (`mpv`.`effectiveTo` IS NULL OR `mpv`.`effectiveTo` > CURRENT_TIMESTAMP(3))
  AND `mpv`.`usageRates` IS NOT NULL
  AND JSON_TYPE(JSON_EXTRACT(`mpv`.`usageRates`, '$.tiers')) = 'ARRAY'
  AND JSON_UNQUOTE(JSON_EXTRACT(`mpv`.`usageRates`, '$.estimator')) = 'byteplus-text-v1';
