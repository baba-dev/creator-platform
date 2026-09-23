-- Persist the credit-conversion snapshot without silently rewriting historical
-- pricing. Before this column existed, the publish API already accepted
-- creditsPerBaisa and stored only the derived customerCredits value.
--
-- Reconstruct creditsPerBaisa from each immutable pricing snapshot using the
-- same round-up semantics as createCreditQuote(). If a historical row cannot
-- be reconstructed exactly, inserting NULL into the NOT NULL temporary table
-- aborts the migration instead of silently defaulting that row to 1.

ALTER TABLE `ModelPriceVersion`
  ADD COLUMN `creditsPerBaisa` BIGINT NULL;

CREATE TEMPORARY TABLE `_ModelPriceVersionCreditsBackfill` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `creditsPerBaisa` BIGINT NOT NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_ModelPriceVersionCreditsBackfill` (`id`, `creditsPerBaisa`)
SELECT
  priced.`id`,
  CASE
    WHEN priced.`customerPriceBaisa` > 0
      AND priced.`customerCredits` > 0
      AND MOD(priced.`customerCredits`, priced.`customerPriceBaisa`) = 0
    THEN CAST(
      priced.`customerCredits` / priced.`customerPriceBaisa`
      AS SIGNED
    )
    ELSE NULL
  END
FROM (
  SELECT
    converted.`id`,
    converted.`customerCredits`,
    CEILING(
      converted.`convertedCostBaisa` * 10000
      / (10000 - converted.`targetMarginBps`)
    ) AS `customerPriceBaisa`
  FROM (
    SELECT
      `id`,
      `customerCredits`,
      `targetMarginBps`,
      CEILING(
        CAST(`providerCostMicroUsd` AS DECIMAL(65, 0))
        * CAST(`fxBaisaNumerator` AS DECIMAL(65, 0))
        / (
          1000000
          * CAST(`fxBaisaDenominator` AS DECIMAL(65, 0))
        )
      ) AS `convertedCostBaisa`
    FROM `ModelPriceVersion`
  ) AS converted
) AS priced;

UPDATE `ModelPriceVersion` AS price_version
JOIN `_ModelPriceVersionCreditsBackfill` AS backfill
  ON backfill.`id` = price_version.`id`
SET price_version.`creditsPerBaisa` = backfill.`creditsPerBaisa`;

DROP TEMPORARY TABLE `_ModelPriceVersionCreditsBackfill`;

ALTER TABLE `ModelPriceVersion`
  MODIFY COLUMN `creditsPerBaisa` BIGINT NOT NULL DEFAULT 1;
