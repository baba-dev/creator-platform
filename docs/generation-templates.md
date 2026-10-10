# Generation templates (P0)

Generation templates are curated, platform-owned creative recipes that resolve
into the existing image, video, or voice generation pipeline. They do **not**
submit provider work directly and they do not create a second billing path.

## Customer flow

1. A workspace member opens `/app/[organizationSlug]/templates`.
2. The library supports text search, media/category filters, favourites, and
   recently used templates.
3. New gallery cards open the existing workspace with `?template=<slug>#create`;
   Studio fetches the published brief using `GET /api/templates/[slug]` and
   collects required input inline. Legacy detail/composer URLs remain supported.
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

The standard production deployment now runs an isolated template-catalog seed
immediately after Prisma migrations and before the release symlink is promoted.
The operation creates only missing built-in templates; it does not overwrite
administrator edits, ordering, featured state, or publish/archive decisions on
templates that already exist.

For operational recovery on an already packaged release, run:

```bash
sudo creator-ops seed-templates
```

For local development, `pnpm db:seed` also calls the same safe catalog seeder.

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

## Templates 2.0 artwork and direct handoff

The built-in gallery uses 25 locally served original SVG illustrations
(`apps/web/public/template-covers/`) and purpose-specific inline SVG marks.
Gallery and dashboard share `TemplateCard`. Custom covers are optional and
stored as optimized 960×540 WebP objects below the persistent
`ASSET_STORAGE_ROOT/templates/covers/` prefix, not release directories.
Administrators upload JPG, PNG or WebP after saving a template: the endpoint
enforces trusted origin, platform RBAC, rate limit, 8 MB input/2 MB output,
pixel bounds, Sharp decode/resize, optimistic update and audit. Published covers
are served by slug; draft previews require `templates:read`. Previous media is
deleted only after a committed replacement. Restoring the built-in cover deletes
the custom object.

Direct activation does not create a parallel provider, job or billing path.
Changing a variable invalidates the previously resolved prompt and quote;
generation stays disabled until the latest server resolver succeeds. The full
compiled prompt remains editable in the existing Studio. If an operator creates
a recipe requiring a secure reference-image variable, a link to the legacy
picker is available until inline asset-picking support is extended. Templates
only resolve to models accepted by the existing BytePlus media generation path.
This must change in lockstep with expansion of that provider contract, not ahead
of it.
