# Aiwa Creators design system

## Pencil & Pixel

Pencil & Pixel is the definitive visual language for Aiwa Creators. It combines
the tactility of an early sketch with the precision expected from a production
creative platform.

The experience should feel:

- imaginative, not childish;
- vivid, not noisy;
- tactile, not ornamental;
- premium, not sterile;
- calm around customer media, not visually competitive with it.

The visual ratio is **70% calm product foundation, 20% vivid creative colour,
and 10% sketch personality**. When in doubt, remove decoration before adding
more.

The living visual reference is available at `/design-system`.

## Source of truth

| Concern                     | Source                                           |
| --------------------------- | ------------------------------------------------ |
| Raw and semantic CSS tokens | `apps/web/src/app/globals.css`                   |
| Font loading and theme boot | `apps/web/src/app/layout.tsx`                    |
| Theme control               | `apps/web/src/components/theme/theme-toggle.tsx` |
| Shared creative primitives  | `apps/web/src/components/ui/creative.tsx`        |
| Core button variants        | `packages/ui/src/button.tsx`                     |
| Visual reference route      | `apps/web/src/app/design-system/page.tsx`        |

Never duplicate raw colour values inside a page or component. A new recurring
value belongs in the token layer first.

## Themes

Two modes are supported: **Light** and **Dark**.

- Light is warm paper with graphite ink. It is the clearest expression of the
  pencil concept.
- Dark is a charcoal drawing board with warm ivory ink. It is not a pure-black
  inversion.
- The first visit follows the operating-system preference.
- A manual selection is saved under `aiwa-theme`.
- The root contract is `<html data-theme="light|dark">`.
- Theme changes use the View Transitions API when supported and fall back to a
  short CSS transition.

Do not create a component prop such as `darkMode`. Components consume semantic
tokens and work in both modes automatically.

## Colour tokens

Values use OKLCH so perceptual lightness and chroma remain predictable between
themes.

| Token               | Meaning                          | Light character      | Dark character  |
| ------------------- | -------------------------------- | -------------------- | --------------- |
| `background`        | Application canvas               | warm off-white paper | charcoal        |
| `foreground`        | Primary ink                      | soft graphite        | warm ivory      |
| `card`              | Raised working surface           | near-white sheet     | lifted graphite |
| `muted`             | Quiet fill                       | oatmeal grey         | muted charcoal  |
| `muted-foreground`  | Supporting text                  | medium graphite      | soft grey       |
| `subtle-foreground` | Metadata only                    | light graphite       | dim grey        |
| `primary`           | Primary action and selection     | violet pencil        | bright violet   |
| `accent`            | Editorial emphasis               | coral marker         | warm coral      |
| `info`              | Information and video            | cyan-blue            | light cyan      |
| `success`           | Ready, completed, healthy        | green                | mint-green      |
| `warning`           | Pending, review, attention       | ochre                | warm yellow     |
| `destructive`       | Failure and irreversible actions | red                  | warm red        |
| `border`            | Structural dividers              | paper-grey line      | graphite line   |
| `ring`              | Keyboard focus                   | violet               | violet          |

### Accent policy

- Violet is the only primary action colour.
- Coral is for editorial emphasis, campaign ideas, and selected creative
  details. It is not a second primary button colour.
- Cyan identifies video or informational states.
- Mint/green communicates successful state only.
- Yellow is a highlighter, warning, or sketch underline. Never set paragraphs in
  yellow.
- Red is reserved for errors, failure, and irreversible actions.
- Never rely on colour alone. Pair status colour with copy, icon, or shape.

### Gradients

Three gradient concepts exist:

1. `--gradient-brand` — violet to magenta to coral; use for brand marks and rare
   primary hero moments.
2. `--gradient-spectrum` — the full creative spectrum; use for text or a thin
   progress flourish, not large reading surfaces.
3. `--gradient-hero` — low-chroma radial atmosphere; safe behind page content.

Do not place body copy directly over a vivid gradient. Use a card, scrim, or
dedicated `on-vivid` text token.

## Typography

| Role       | Typeface            | Typical use                                      |
| ---------- | ------------------- | ------------------------------------------------ |
| Display    | Bricolage Grotesque | H1–H3, campaign statements, creative moments     |
| Body       | Manrope             | UI, paragraphs, labels, forms, tables            |
| Annotation | Caveat              | short human notes, arrows, sketch captions       |
| Mono       | system monospace    | token names, IDs, timestamps, technical metadata |

All three primary families use self-hosted Fontsource variable packages. Builds
do not depend on Google Fonts or any external font request.

### Type scale

| Role       | Size     | Line height | Weight  | Tracking     |
| ---------- | -------- | ----------- | ------- | ------------ |
| Display XL | 72–88 px | 0.98        | 600     | -0.055 em    |
| Display L  | 48–64 px | 1.0         | 600     | -0.045 em    |
| H1 app     | 36–48 px | 1.05        | 600     | -0.035 em    |
| H2         | 28–36 px | 1.1         | 600     | -0.03 em     |
| H3         | 20–24 px | 1.2         | 600     | -0.02 em     |
| Body L     | 18 px    | 1.65        | 400–500 | normal       |
| Body       | 14–16 px | 1.6         | 400–500 | normal       |
| Label      | 12–14 px | 1.35        | 600     | normal       |
| Eyebrow    | 10–11 px | 1.2         | 700     | 0.16–0.22 em |
| Annotation | 20–36 px | 1.1         | 600     | natural      |

Rules:

- Use `font-display` for headings, not entire screens.
- Use `font-hand` for no more than one short phrase in a region.
- Keep paragraphs at 45–72 characters per line.
- Prefer sentence case. Uppercase is limited to eyebrows and metadata.
- Use tabular numerals for balances, credits, time, and usage.
- Never use the annotation face for warnings, legal copy, financial values, or
  controls.

## Spacing and layout

The base rhythm is 4 px. Prefer Tailwind values on this sequence:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`.

| Context                   | Guidance                              |
| ------------------------- | ------------------------------------- |
| Control inset             | 8–12 px vertical, 12–20 px horizontal |
| Card inset                | 20 px compact, 24–32 px standard      |
| Grid gap                  | 12–16 px dense, 20–24 px editorial    |
| Section gap               | 64 px mobile, 80–112 px desktop       |
| App content width         | fluid inside the shell                |
| Marketing/reference width | `max-w-7xl`                           |
| Reading width             | `max-w-2xl` or `max-w-3xl`            |

Use generous negative space around generated media. Dense administrative tables
may tighten spacing, but should not reduce interactive targets below 40 px.

## Radius, borders, and elevation

- Small controls: 10 px.
- Inputs and buttons: 14 px.
- Cards: 18–24 px.
- Editorial/hero surfaces: up to 32 px.
- Pills are reserved for status, filters, and very short metadata.
- Standard cards use a one-pixel `border-border` and semantic shadow.
- A `sketch-card` adds a small offset graphite shadow. Use it once per group,
  not on every nested item.
- Dark mode shadows are deeper; light mode shadows are softer and warmer.
- Avoid glassmorphism as the default. Backdrop blur is for sticky chrome,
  floating controls, and media overlays only.

## Sketch language

Sketch gestures make the interface ownable. They are accents, not a theme park.

Approved gestures:

- highlighter underline on one important phrase;
- irregular ring around one small callout;
- offset shadow on a featured card;
- graph-paper or dot-paper background at low opacity;
- hand annotation of six words or fewer;
- line icons with round caps;
- a short drawn-path reveal.

Do not:

- rotate normal paragraphs or controls;
- combine more than two gestures in one card;
- use fake torn paper on routine application screens;
- use handwritten type for navigation;
- reduce legibility to make an element look handmade;
- decorate tables, financial records, or permission warnings.

## Components and page anatomy

### Global header

- 72–80 px tall.
- Brand at start; high-value navigation in the middle; theme and primary action
  at end.
- Sticky application headers use `background/80`, a border, and modest blur.
- Do not show more than one filled primary action.

### Sidebar and menus

- Sidebar uses `sidebar` and `sidebar-foreground`.
- Active items use a quiet semantic fill, primary icon, and optional dot.
- Inactive items use muted text and reveal foreground colour on hover.
- Group titles use the mono eyebrow style.
- Navigation icons stay 18–20 px.

### Hero

- One display headline and one short supporting paragraph.
- One focal sketch mark.
- At most two actions: primary then secondary.
- Decorative gradients sit behind content and do not lower contrast.
- Product previews use actual component language rather than generic browser
  chrome whenever practical.

### Headings and paragraphs

- Every section needs hierarchy: eyebrow, title, then optional description.
- Do not center long paragraphs.
- A paragraph following a title should usually be muted, not primary ink.

### Cards

- Standard: card background, border, small shadow.
- Interactive: add hover lift of at most 4 px and a border-colour change.
- Featured: sketch card or atmospheric gradient, not both unless it is a hero.
- A card must not contain another equally elevated card.

### Forms

- Labels are always visible; placeholders are examples, not labels.
- Inputs use `background` or a quiet sunken surface and `border-input`.
- Focus uses `ring`; errors use `destructive` and text.
- Help and character counts use `subtle-foreground`.
- Primary submission stays at the natural end of the flow.

### Tables and administration

- Keep the canvas calm and high contrast.
- Use colour only for status or exceptional rows.
- Numeric columns align right and use tabular numerals.
- Destructive actions require explicit wording and confirmation.
- Financial states must not use decorative sketch typography.

### Generated media

- Generated media is the most vivid item on the screen.
- Use neutral framing, restrained controls, and `on-vivid` for overlays.
- Never tint real customer media to match the interface palette.
- Loading should communicate generation progress, stage, and expected wait.

### Empty states

- One line icon or small sketch, a clear explanation, and one next action.
- Do not imply a real result exists when the feature is demo-only.

## Motion

Motion follows the principle: **show cause and preserve place**.

### Technology

- CSS transitions and keyframes handle hover, focus, ambient float, and simple
  entry motion.
- The browser View Transitions API handles theme changes where available.
- Use the Web Animations API for imperative sequences that do not need React
  lifecycle coordination.
- Add Motion for React only when a feature needs layout animation, shared
  elements, gesture physics, or exit animation. Do not add it for opacity and
  translate alone.

### Timing

| Token   | Duration | Use                                        |
| ------- | -------- | ------------------------------------------ |
| instant | 100 ms   | pressed state                              |
| fast    | 180 ms   | hover, focus, colour                       |
| base    | 280 ms   | control and card transitions               |
| slow    | 520 ms   | page reveal and deliberate creative motion |

- Product motion uses `cubic-bezier(0.22, 1, 0.36, 1)`.
- Playful micro-interactions may use the spring easing.
- Hover lift is 2–4 px; scale is no more than 1.05.
- Ambient animation runs for 4–8 seconds and never blocks interaction.
- Stagger no more than 5–7 visible items and keep delay below 80 ms per item.
- Every animation must remain understandable when removed.
- `prefers-reduced-motion` is mandatory; the global stylesheet reduces all
  non-essential animation.

## Accessibility

- Target WCAG 2.2 AA for text and UI contrast.
- Do not use `subtle-foreground` for essential instructions.
- All keyboard focus is visible through `ring`.
- Minimum target: 40 × 40 px; prefer 44 × 44 px for isolated touch controls.
- Theme controls have explicit accessible names.
- Status requires text in addition to colour.
- Respect reduced motion and forced colours.
- Do not put essential information in background illustrations.

## AI implementation contract

Any coding agent creating or editing Aiwa Creators UI must:

1. Read this document and `AGENTS.md` before editing UI.
2. Use semantic classes such as `bg-background`, `bg-card`, `text-foreground`,
   `text-muted-foreground`, `border-border`, and `text-primary`.
3. Verify the result in both light and dark modes.
4. Reuse `Button`, `ThemeToggle`, `CreativeSurface`, `Eyebrow`, `Annotation`,
   `Brand`, and `Icon` before inventing equivalents.
5. Use Bricolage for display headings, Manrope for product copy, and Caveat only
   for short annotations.
6. Keep one focal sketch gesture per major viewport.
7. Preserve clear demo labels until provider-backed behaviour exists.
8. Preserve responsive behaviour from 320 px through wide desktop.
9. Preserve visible focus, reduced-motion behaviour, and readable contrast.
10. Run formatting, lint, typecheck, tests, and build.

An agent must not:

- add a fixed hex/RGB colour to ordinary product UI;
- use a Tailwind palette class such as `text-violet-300` when a semantic token
  exists;
- create a third theme;
- make light and dark component forks;
- add a new font without a system-level decision;
- use gradient text for paragraphs or data;
- add endless ambient motion;
- use sketch effects inside financial, security, permission, or error content;
- turn a demo control into language that implies a working provider call.

### Reference skeleton

```tsx
<main className="min-h-screen bg-background text-foreground">
  <header className="border-b border-border bg-background/80 backdrop-blur-xl">
    <Brand />
    <ThemeToggle />
  </header>
  <section className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
    <Eyebrow>Section context</Eyebrow>
    <h1 className="font-display mt-4 text-5xl font-semibold tracking-tight">
      Clear title with <span className="sketch-underline">one idea.</span>
    </h1>
    <p className="mt-4 max-w-2xl text-muted-foreground">
      Concise supporting copy.
    </p>
    <CreativeSurface className="mt-10 p-6">Product content</CreativeSurface>
  </section>
</main>
```

## Review checklist

- [ ] Light and dark modes both render correctly.
- [ ] No fixed palette value was added without a documented token need.
- [ ] Hierarchy is readable without colour.
- [ ] Display, body, annotation, and mono roles are respected.
- [ ] Only one filled primary action appears per action group.
- [ ] Sketch accents remain sparse.
- [ ] Generated media remains the visual focus.
- [ ] Hover, focus, disabled, loading, empty, error, and success states exist.
- [ ] Keyboard navigation and focus are visible.
- [ ] Reduced motion is respected.
- [ ] Mobile layout works from 320 px.
- [ ] Demo behaviour is labelled honestly.
