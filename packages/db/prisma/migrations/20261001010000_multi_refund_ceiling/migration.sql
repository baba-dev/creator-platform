-- Allow multiple partial reversals of a single ledger entry with locked cumulative ceiling.
DROP INDEX `LedgerEntry_reversalOfId_key` ON `LedgerEntry`;
CREATE INDEX `LedgerEntry_reversalOfId_idx` ON `LedgerEntry`(`reversalOfId`);
