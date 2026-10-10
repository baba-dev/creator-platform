-- Classify media jobs independently of absent optional JSON task fields.
ALTER TABLE GenerationJob ADD COLUMN mediaHistoryEligible BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE GenerationJob SET mediaHistoryEligible = FALSE WHERE JSON_UNQUOTE(JSON_EXTRACT(requestPayload, '$.task')) = 'transcription';
CREATE INDEX GenerationJob_organizationId_mediaHistoryEligible_createdAt_id_idx ON GenerationJob(organizationId, mediaHistoryEligible, createdAt, id);
