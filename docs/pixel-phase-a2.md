# Pixel Phase A2 — Artwork acceptance

## Scope and approval

This PR contributes first-party static vector artwork **only**. The existing
homepage, Pixel assistant, process illustrations, logo, manifest, site
navigation, and billing remain untouched. The original existing chubby Pixel
reference and revised Phase A character sheet are the user's art-direction
references. The newly drawn vector is a faithful **adaptation for rigging**, not
a lossless vectorization of the embedded PNG in the legacy SVG.

## Visual contract

- Legacy anatomy reference:
  `apps/web/public/brand/mascots/creators-mascot-working-laptop-queued-laptop-float.svg`
- Vector master: `apps/web/public/brand/pixel/pixel-master.svg`
- Identity traits: broad sideways graphite-tipped ears, round face, small flick
  of hair, glossy eyes, whiskers, tiny smiling muzzle, chubby short-limbed body,
  curved dark-tipped tail, dark feet
- Ivory/graphite artwork with restrained pencil texture; violet/coral are
  environment and annotation accents, not a replacement character palette
- Shared geometry across the entire expression/pose export library; props remain
  distinct from the master

## Reviewer checklist

1. Visually compare master, fallback and optional laptop scene with the original
   reference.
2. Check every expression, especially eye-roll, happy, awake and concerned.
3. Examine crouch, bump/jump, landing squash, idle and wave as separate motion
   key illustrations.
4. Verify master and face rig contain independently addressable
   head/ears/tail/paws/eyes/pupils/mouth layers.
5. Inspect real stroke-only contours and ordering metadata in
   `pixel-hero-outline.svg`; it must not be a bitmap wipe.
6. Render representative artwork on illustration-paper in both light and dark
   surrounding themes, at hero and smaller preview sizes.
7. Verify assets contain no embedded raster, active animation, foreign/external
   refs or scripts.
8. Verify deterministic export synchronization with
   `node apps/web/scripts/build-pixel-phase-a2.mjs --check`; then run
   `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
   `pnpm build`.

Art review and final-head CI are separate acceptance requirements. Do not merge
until both are complete. Phase B implements motion/pointer/scroll, and
subsequent phases implement the homepage; neither belongs in this PR.
