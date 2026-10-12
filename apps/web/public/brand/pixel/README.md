# Pixel — Phase A2 artwork

This is an **artwork-only**, opt-in vector library. Nothing here changes the existing Creative Cursor logo, Pixel assistant, process illustrations, homepage, PWA, or product interactions.

## Identity reference

The original `/brand/mascots/creators-mascot-working-laptop-queued-laptop-float.svg` and the user's approved Phase A character sheet are anatomical/art-direction references. Pixel has a plush rounded seated body, extremely wide upward-angled ears with graphite tips, small hair tuft, a large rounded face and glossy eyes, tiny smiling muzzle, short forepaws, whiskers, and a curled dark-tipped tail. This collection is a **manual vector adaptation**, not a claim that the original raster-containing SVG has become a lossless vector.

## Library

- `pixel-master.svg`: canonical layered static character
- `pixel-face-rig.svg`: isolated eyes/pupils/brows/nose/mouth/whiskers
- `pixel-hero-outline.svg`: ordered, real stroke-only paths with `pathLength="1"` and `data-pencil-order` for Phase B
- `pixel-static-fallback.svg`: motion-free illustration
- `pixel-laptop-companion.svg`: optional laptop prop based on the original reference (the prop is not part of the character rig)
- `expressions/`: ten standalone expression variants
- `poses/`: eight standalone motion-key illustrations
- `manifest.json`: inventory and approved artwork-only scope

All exports are standalone local SVGs with internal defs only. No embedded PNG, external URL, script, active animation, CSS injection, or customer media. Existing files and paths remain unchanged.

## Anatomy/animation contract

`#pixel-character` includes `#pixel-head`, `#pixel-ear-left`, `#pixel-ear-right`, `#pixel-tail`, `#pixel-paws`, `#pixel-feet`, and `#pixel-details`. Facial groups include `#pixel-eyes`, `#pixel-eye-left`, `#pixel-eye-right`, `#pixel-pupil-left`, `#pixel-pupil-right`, `#pixel-brows`, `#pixel-whiskers`, `#pixel-nose`, and `#pixel-mouth`. The pose files are static key artwork, **not** animated timelines. The draw-on outline consists of individually addressable contours; render a fully drawn fallback before or without JS.

All individual assets use a `0 0 720 520` viewBox. Preserve the whole aspect ratio; don't crop ear/tail tips or invert the artwork in dark mode. Display on `illustration-paper`. Any subsequent animation must respect reduced motion, pause off-screen, and cap pupil movement inside the eye. Apply violet/coral accents sparingly around Pixel.

## Deterministic maintenance

`apps/web/scripts/build-pixel-phase-a2.mjs` is the single source for these generated assets. Do not hand-edit exports. Modify the builder, run `node apps/web/scripts/build-pixel-phase-a2.mjs --write`, inspect the artwork, and run `node apps/web/scripts/build-pixel-phase-a2.mjs --check`. No third-party build-time dependencies are required.

Phase B animation and Phase C/D homepage integration require a separate PR and artwork sign-off.
