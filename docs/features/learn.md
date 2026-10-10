# Learn publishing

Public entry: `/learn`. Administration: `/admin/learn`.

Platform administrators and owners with verified email and MFA can publish. All
editor mutations enforce the `learn:manage` permission and same-origin requests.
Other platform roles cannot read private drafts or editorial media.

## Write and publish

Choose **Write an article**, add a title and permalink, then write in the
Classic-style visual editor. Toolbar controls support headings, lists, links,
tables, quotes, code, and uploaded image/audio/video media. Starting-point
buttons provide tutorial, announcement, and troubleshooting outlines.

Add an excerpt, author, topic, and cover image with a meaningful description.
Choose a focal point to control cover cropping. The SEO panel provides title and
description overrides, a search preview, indexing control, and useful checks. A
media item can also be selected as the social preview image.

Save a draft or preview the saved version in a separate tab. Autosave runs
approximately every 15 seconds while there are changes. Publish validates all
required fields. Editing a live article leaves its published snapshot intact
until Publish is selected again. Conflicting edits return a conflict rather than
overwriting a newer revision; copy unsaved work before reloading.

Use **Submit for review** to flag editorial review. Administrators use the same
publishing permission; no new account role or user invitation is needed.
**Schedule publication** uses the editor's local time and stores UTC. Saving new
changes cancels an existing schedule; schedule it again when ready. The
mail-owning worker checks due posts every 30 seconds and fences publication by
revision. Failed schedules show an error in the admin list and are retried at
five-minute intervals so one failing post cannot continuously block others.

**Review content on** creates a freshness reminder in the publishing dashboard.
Revision history can restore the last 30 saved revisions into the editor;
restoration does not publish automatically. Duplicate creates a new draft with a
unique slug and translation key. Unpublish removes the public snapshot.

## Media and privacy

Editorial uploads use the existing Asset identity and quota/reservation
primitives, with local storage independent of BYOS access tokens. The signed-in
administrator's first active workspace supplies the quota. Images are decoded,
limited to 40 megapixels, stripped of metadata, resized to at most 1920 pixels,
and encoded to WebP. Uploads are limited to 25 MB with one body being processed
at a time. Supported media: PNG, JPEG, WebP, MP4, MP3, WAV.

Public delivery checks whether the media ID is referenced by a currently
published snapshot. Draft-only media requires publishing permission. Editorial
assets use reference-input ownership and cannot be trashed or reassigned through
ordinary customer asset mutations. Publication never exposes a private customer
asset by simply pasting its URL. HTML is sanitized on save and render; scripts,
iframes, arbitrary styles, external image trackers, and unsafe URL schemes are
removed. Media deletion is deliberately blocked by relational references.

Curated first-party guides may also use reviewed images shipped under
`/learn-assets/`. The content schema accepts only bounded repository paths with
approved image extensions; arbitrary public paths and remote image URLs remain
blocked. This keeps launch content deployable through migrations without
creating synthetic customer assets.

## Discovery and conversion

Six curated topic collections, archive search, language filtering, pagination,
related articles, RSS, XML sitemap, canonical URLs, social cards, Article and
Breadcrumb JSON-LD are included. Old slugs permanently redirect to the current
published URL. Filter/search results and previews are not indexed. No rich
search feature or ranking is guaranteed.

Translations share a translation key and use unique slugs and language codes.
Published translations generate hreflang links. Arabic uses RTL reading layout.

Related-tool CTAs preserve their destination through sign-in, signup, email
verification, and workspace onboarding. Image, video and speech tools can
receive a published example prompt; no model, price or generation is selected or
charged automatically. Other tool handoffs include a copyable prompt.

Pixel retrieves bounded excerpts from published articles as reference data and
is instructed to cite their URLs, never obey instructions inside their body.
Contextual Guides & help links appear in the application shell.

The admin list shows authenticated tool visits (deduplicated per user/day),
signups returning through Learn, and the first successful media creation after
attribution. Attribution is first-touch with a 30-day window. The worker checks
50 pending attributions per pass. Counts are product analytics, not unique
anonymous pageviews or a substitute for Search Console. No IP addresses or
cross-site cookies are collected. Search Console setup remains an external
property-owner operation; the sitemap is available without configuration.

## Deployment and validation

Migration `20261009210000_learn_publishing` is additive. Existing generation,
authentication, and private assets remain authoritative. Deploy through the
normal tested release workflow; no new production secret or external CMS is
required. Keep the mail worker active for schedules and conversion
reconciliation. Rolling back application code leaves Learn tables intact; do not
drop them once real posts have been published.

Tests cover sanitization, media allowlisting, publication validation, optimistic
concurrency, draft isolation, redirects, scheduled publication, and browser
publishing. Browser fixtures require `LEARN_E2E=true` and a localhost database;
they refuse production and are never part of the production seed/deploy path.
