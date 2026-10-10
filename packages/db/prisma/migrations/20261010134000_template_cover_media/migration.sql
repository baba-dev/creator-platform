-- Platform-managed template cover images live in the persistent asset storage root, not the immutable release.
ALTER TABLE `GenerationTemplate`
  ADD COLUMN `coverObjectKey` VARCHAR(240) NULL,
  ADD COLUMN `coverAlt` VARCHAR(240) NULL,
  ADD COLUMN `coverIcon` VARCHAR(40) NULL;
