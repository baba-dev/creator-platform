# Generation templates (P0)

Generation templates are curated, platform-owned creative recipes that resolve
into the existing image, video, or voice generation pipeline. They do **not**
submit provider work directly and they do not create a second billing path.

## Customer flow

1. A workspace member opens `/app/[organizationSlug]/templates`.
2. The library supports text search, media/category filters, favourites, and
   recently used templates.
3. The template detail page renders its validated structured variables.
4. `POST /api/templates/[slug]/resolve` validates workspace membership,
   variables, reference-image ownership, published state, current model
   availability, active pricing, and live provider capabilities.
5. The browser stores the short-lived resolved handoff in `sessionStorage` and
   opens Studio. Raw prompts and reference IDs are not placed in the URL.
6. Studio applies the resolved prompt/defaults, visibly identifies the active
   template, and still allows the user to change normal Studio controls.
7. The ordinary `POST /api/generations` endpoint creates the durable job.
   `templateId` is accepted only when it refers to a **published** template
   whose media kind matches the selected generation path.

Credits remain governed by the existing reservation/capture/release system.
Opening or resolving a template never charges a customer.

## Template language

P0 deliberately supports only inert placeholders:

```text
{{variableName}}
```

There is no Handlebars/Jinja/JavaScript expression execution. Variables are
schema-validated and unknown request keys are rejected. Supported variable types
are text, textarea, select, toggle, number, and reference-image.

Reference-image variables resolve to asset IDs separately from prompt text. The
resolver verifies the asset is READY, belongs to the active organization, is
owned by the current user for reference-input storage, and is an image. Those
IDs continue through the existing GenerationInputAsset security path.

## Model compatibility

Templates store output preferences, not provider commands. The resolver checks
current `ProviderModel.capabilities` for aspect ratio, resolution, duration,
audio, and reference-image support. `preferredModelId` is only a preference: if
that model is disabled, unpriced, or incompatible, another compatible enabled
model may be selected.

This keeps templates valid across provider catalog changes and avoids binding
the product UX to one provider implementation.

## Administration

Platform users with `templates:read` can inspect the catalog at
`/admin/templates`. `templates:manage` is required to create or update
templates. Operators have read-only access; Platform Admin and Platform Owner
may manage the catalog.

Admin mutations:

- enforce same-origin request checks;
- use strict Zod schemas;
- create immutable AuditEvent records;
- support DRAFT, PUBLISHED, and ARCHIVED lifecycle states.

Only PUBLISHED IMAGE/VIDEO/VOICE templates are customer-discoverable.

## Deployment

The migration `20260929010000_generation_templates_p0` creates
GenerationTemplate, TemplateFavorite, and GenerationJob.templateId.

Run the standard deployment migration, then `pnpm db:seed`. Seeding uses
slug-based upserts and publishes the curated MVP catalog, so it is safe to
repeat and does not create duplicate templates.

## P0 scope

Included:

- curated platform template library;
- image, video, and voice recipes;
- search/filter discovery;
- favourites and recently used;
- structured brief variables;
- capability-aware model resolution;
- reference-image variable security;
- Studio handoff with multi-output defaults;
- generation provenance;
- admin create/edit/publish/archive/feature/order;
- audit events and focused resolver tests.

Intentionally deferred: customer-authored templates, organization sharing,
marketplace/community publishing, template ratings, revenue sharing, scripting,
branches, and multi-step workflow orchestration.
