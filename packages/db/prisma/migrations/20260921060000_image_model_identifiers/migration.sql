-- Preserve primary keys, pricing, enabled flags and job relationships.
-- If a canonical model already exists, leave the legacy row intact.
UPDATE ProviderModel AS legacy
LEFT JOIN ProviderModel AS canonical
  ON canonical.provider = legacy.provider
  AND canonical.providerModelId = 'seedream-5-0-260128'
SET legacy.providerModelId = 'seedream-5-0-260128'
WHERE legacy.provider = 'BYTEPLUS'
  AND legacy.providerModelId = 'seedream-5-lite'
  AND canonical.id IS NULL;

UPDATE ProviderModel AS legacy
LEFT JOIN ProviderModel AS canonical
  ON canonical.provider = legacy.provider
  AND canonical.providerModelId = 'seedream-4-5-251128'
SET legacy.providerModelId = 'seedream-4-5-251128'
WHERE legacy.provider = 'BYTEPLUS'
  AND legacy.providerModelId = 'seedream-4-5'
  AND canonical.id IS NULL;
