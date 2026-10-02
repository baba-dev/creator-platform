-- Add supported external inference providers. Model rows are synchronized disabled
-- and require an explicit active price before they can be enabled.
ALTER TABLE `ProviderModel`
  MODIFY COLUMN `provider`
  ENUM('BYTEPLUS', 'NVIDIA', 'GROQ', 'GEMINI', 'CLOUDFLARE') NOT NULL;
