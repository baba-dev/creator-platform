-- Commercialize the two verified dual-use external reasoning models through the
-- durable TEXT generation pipeline without replacing their ProviderModel IDs.
--
-- Existing ModelPriceVersion rows remain attached to the same ProviderModel
-- records. REQUEST-priced snapshots therefore continue to support sponsored
-- prompt enhancement, while commercial TEXT Studio discovery requires a valid
-- TOKEN rate table before these models are shown for paid creative work.

UPDATE `ProviderModel`
SET
  `mediaKind` = 'TEXT',
  `description` = 'High-depth Groq reasoning and commercial text model for creative direction, story planning, and prompt enhancement.',
  `capabilities` = JSON_MERGE_PATCH(
    COALESCE(`capabilities`, JSON_OBJECT()),
    JSON_OBJECT(
      'reasoning', TRUE,
      'creativeDirector', TRUE,
      'storyPlanning', TRUE,
      'task:creative-director', TRUE,
      'task:story-planning', TRUE,
      'task:prompt-enhancement', TRUE
    )
  )
WHERE `provider` = 'GROQ'
  AND `providerModelId` = 'openai/gpt-oss-120b';

UPDATE `ProviderModel`
SET
  `mediaKind` = 'TEXT',
  `description` = 'Long-context Gemini reasoning and commercial text model for creative direction, story planning, and prompt enhancement.',
  `capabilities` = JSON_MERGE_PATCH(
    COALESCE(`capabilities`, JSON_OBJECT()),
    JSON_OBJECT(
      'reasoning', TRUE,
      'creativeDirector', TRUE,
      'storyPlanning', TRUE,
      'task:creative-director', TRUE,
      'task:story-planning', TRUE,
      'task:prompt-enhancement', TRUE
    )
  )
WHERE `provider` = 'GEMINI'
  AND `providerModelId` = 'gemini-3.8-flash';
