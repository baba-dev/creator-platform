# Creators Solutions 2.0

Public routes: /solutions and /solutions/{marketing-agencies,ecommerce,social-media-creators,businesses,production-teams}.

The goal is outcome-first public discovery rather than duplicating the /tools directory or /pricing catalogue. Editorial content and audited Studio mapping live in apps/web/src/lib/public-solutions.ts. Original campaign-board SVGs are stored in apps/web/public/solution-art. These are illustrative artwork, not customer testimonials or a representation of guaranteed provider output.

The guided finder is deterministic and client-side: it performs no generation jobs, does not access wallets and links to validated tool pages and /tools/start/{id}, which manages authentication and destination routing. No signup credentials or personal data are required to browse.

Pricing and availability must always be taken from getPublicPricingCatalogue. This projection includes enabled models with configured runtime access and currently published customer price versions. Never expose internal cost, margin or unlisted models in the public view. Reference prices do not replace an authenticated pre-generation quote.

Marketing metadata must be unique per audience page and pages must be included in the public sitemap. Copy must avoid invented savings percentages, client testimonials or guarantees. Preserve rights and consent notices for supplied product photos, portraits and driving media. Accessible static content is server rendered; the interactive finder is progressively isolated on the client.

Acceptance gates: formatting, lint, typecheck, tests, build-release, browser-smoke and aggregate quality must pass before merge. Verify six pages, all model category tables, five solution routes, keyboard use, narrow viewport overflow, light/dark themes and no unauthenticated provider job calls.
