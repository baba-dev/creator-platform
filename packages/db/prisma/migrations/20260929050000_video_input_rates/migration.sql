ALTER TABLE `ModelPriceVersion`
  ADD COLUMN `videoInputRate720p` BIGINT NULL,
  ADD COLUMN `videoInputRate1080p` BIGINT NULL;

UPDATE `ProviderModel`
SET `capabilities` = JSON_SET(COALESCE(`capabilities`, JSON_OBJECT()), '$.referenceVideo', JSON_EXTRACT('true', '$'))
WHERE `provider` = 'BYTEPLUS'
  AND `providerModelId` = 'dreamina-seedance-2-5-260628';
