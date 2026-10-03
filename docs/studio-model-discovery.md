# Studio model discovery

Studio model availability is server-authoritative and task-based.

A model is discoverable only when all of the following are true:

1. the catalog marks the model as supporting the requested `StudioTask`;
2. the model is enabled in `ProviderModel`;
3. an active `ModelPriceVersion` exists;
4. the provider credentials required by that model family are configured.

The public endpoint is:

```
GET /api/studio/models?organizationId=<id>&task=<studio-task>
```

It requires an authenticated member with `workspace:view` permission and returns
only customer-safe metadata. Provider costs, negotiated discounts, margins,
credentials, and internal pricing notes are never returned.

## Canonical tasks

- `chat`
- `character-chat`
- `scriptwriting`
- `creative-director`
- `brand-strategy`
- `story-planning`
- `prompt-enhancement`
- `speech-synthesis`
- `transcription`
- `image-generation`
- `video-generation`

Catalog synchronization normalizes legacy capability keys to `task:<task>`.
Media kind is still enforced, so a reasoning-only model cannot become a billable
text Studio model merely because it advertises a similarly named legacy
capability.

## Adding a model

Add the provider descriptor and verified capabilities to the provider catalog.
Prefer explicit `task:<task>` capabilities. Legacy capabilities are normalized
for existing models, and narrowly scoped verified overrides preserve current
product defaults. After catalog sync, pricing, enablement, and runtime
configuration control whether the model becomes discoverable.

Do not add provider-specific Studio dropdown arrays. New Studio surfaces must
consume the shared discovery service and should submit the returned
`ProviderModel.id`, not assume upstream provider model IDs are globally unique.

## Character Chat persistence

Character Chat stores `ProviderModel.id` in the nullable `providerModelRecordId`
relation for new personas and threads. The historical upstream `modelId` string
remains as compatibility metadata during the migration window.

The migration backfills historical BytePlus TEXT rows only. Read paths can
upgrade a unique legacy upstream id to its canonical record, but a known
canonical record that later becomes disabled, unpriced, unconfigured, or
task-ineligible fails closed. It is never reinterpreted as another provider.

A chat thread pins its provider-model record when created. Persona model
preferences are defaults for new conversations and do not override an existing
thread. If a persona preference is unavailable, the user must explicitly choose
a replacement model before starting a replacement conversation.

## Dynamic TEXT Studio integration

Creative Director, Scriptwriting, Brand Strategy, and Story Planning consume the
same discovery and canonical model-resolution layer as Character Chat.

Each surface submits the canonical `ProviderModel.id`. The API resolves that
selection again for the exact task before issuing a quote or creating a job, so
frontend visibility is not treated as an authorization boundary. Legacy upstream
model IDs remain accepted only when they resolve uniquely.

These four workflows intentionally remain on the durable TEXT job pipeline.
Models with `mediaKind=REASONING` are excluded even if they advertise a related
creative capability. They must use the reasoning admission/billing path rather
than being silently charged as text generation.

Current verified task examples include:

- Scriptwriting: BytePlus Seed 2.0 Lite, Groq GPT-OSS 20B, Gemini Flash-Lite,
  and Cloudflare Llama when each is enabled, priced, and configured.
- Creative Director: verified BytePlus TEXT director models plus Cloudflare
  Llama.
- Brand Strategy and Story Planning: only catalog models explicitly verified for
  those tasks; no generic chat-model fallback is performed.
