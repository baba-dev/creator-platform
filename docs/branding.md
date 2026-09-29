# Creators brand media

Approved mark: **Creative Cursor (01-A)**.

Static product branding lives in `apps/web/public/brand/` and is served from `/brand/...`.

```text
brand/
├── logos/
│   ├── creators-horizontal-black-transparent.webp
│   └── creators-horizontal-white-transparent.webp
└── icons/
    ├── favicon/
    │   ├── creators-favicon-32x32-transparent.webp
    │   └── creators-favicon-64x64-transparent.webp
    └── pwa/
        ├── creators-pwa-192x192-transparent.webp
        ├── creators-pwa-512x512-transparent.webp
        ├── creators-pwa-maskable-192x192-dark.webp
        └── creators-pwa-maskable-512x512-dark.webp
```

Use black artwork on light surfaces and white artwork on dark surfaces. PWA maskable icons intentionally use an opaque dark field so OS cropping preserves the mark's safe area.

These files are application identity assets, not customer media. Customer uploads and generated outputs continue through the `Asset` domain and `@aiwa/assets`.
