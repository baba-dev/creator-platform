-- Allow multiple partial reversals of a single ledger entry with a cumulative ceiling.
-- MariaDB uses the original unique reversal index to support the self-referencing
-- foreign key, so the FK must be removed before replacing that index and then
-- restored against the new non-unique index.
ALTER TABLE `LedgerEntry`
  DROP FOREIGN KEY `LedgerEntry_reversalOfId_fkey`;

DROP INDEX `LedgerEntry_reversalOfId_key` ON `LedgerEntry`;
CREATE INDEX `LedgerEntry_reversalOfId_idx` ON `LedgerEntry`(`reversalOfId`);

ALTER TABLE `LedgerEntry`
  ADD CONSTRAINT `LedgerEntry_reversalOfId_fkey`
    FOREIGN KEY (`reversalOfId`) REFERENCES `LedgerEntry`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
