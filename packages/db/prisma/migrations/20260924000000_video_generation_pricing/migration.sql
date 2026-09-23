-- AlterTable ModelPriceVersion
ALTER TABLE `ModelPriceVersion`
  MODIFY COLUMN `pricingDimension` ENUM('REQUEST', 'CHARACTER', 'SECOND') NOT NULL DEFAULT 'REQUEST';

-- Update seeded Seedance 2.5 active price to SECOND pricing with unitQuantity = 5 if using default seeded price
UPDATE `ModelPriceVersion` price
JOIN `ProviderModel` model ON model.`id` = price.`providerModelId`
SET price.`pricingDimension` = 'SECOND',
    price.`unitQuantity` = 5
WHERE model.`provider` = 'BYTEPLUS'
  AND model.`providerModelId` = 'dreamina-seedance-2-5-260628'
  AND price.`effectiveTo` IS NULL
  AND price.`pricingDimension` = 'REQUEST'
  AND price.`providerCostMicroUsd` = 468000
  AND price.`customerCredits` = 240
  AND price.`unitQuantity` = 1;
