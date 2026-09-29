# Creators brand media

Approved mark: **Creative Cursor (01-A)**.

Static product branding lives in `apps/web/public/brand/` and is served from
`/brand/...`.

```text
brand/
├── logos/
│   ├── creators-horizontal-black-transparent.webp
│   ├── creators-horizontal-white-transparent.webp
│   ├── creators-symbol-black-transparent.webp
│   └── creators-symbol-white-transparent.webp
└── icons/
    ├── compatibility/
    │   ├── favicon.ico
    │   └── apple-touch-icon-180x180.png
    ├── favicon/
    │   ├── creators-favicon-32x32-transparent.webp
    │   └── creators-favicon-64x64-transparent.webp
    └── pwa/
        ├── creators-pwa-192x192-transparent.webp
        ├── creators-pwa-512x512-transparent.webp
        ├── creators-pwa-maskable-192x192-dark.webp
        └── creators-pwa-maskable-512x512-dark.webp
```

Use black artwork on light surfaces and white artwork on dark surfaces. PWA
maskable icons intentionally use an opaque dark field so OS cropping preserves
the mark's safe area.

The shared `Brand` component selects the horizontal or compact symbol artwork
and follows the root `data-theme` attribute. Use it in navigation, headers,
authentication, and footer surfaces; pass a workspace URL as `href` inside an
organization. Keep the horizontal logo at least 160 px wide and allow clear
space around it. Use the symbol in narrow headers. Do not wrap `Brand` in a
second link. Product action icons remain in the shared `Icon` component.

The ICO and Apple touch icon provide browser and home-screen compatibility. The
WebP favicon and manifest paths remain stable for existing installations.

These files are application identity assets, not customer media. Customer
uploads and generated outputs continue through the `Asset` domain and
`@aiwa/assets`.
