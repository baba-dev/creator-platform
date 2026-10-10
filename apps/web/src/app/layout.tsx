import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/caveat";
import "@fontsource-variable/manrope";

import "./globals.css";
import { PwaRuntime } from "@/components/pwa/pwa-runtime";

const themeBootScript = `
  (() => {
    try {
      const saved = localStorage.getItem("aiwa-theme");
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = saved === "light" || saved === "dark"
        ? saved
        : systemDark ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      document.documentElement.dataset.theme = "dark";
    }
  })();
`;

export const metadata: Metadata = {
  title: {
    default: "Aiwa Creators",
    template: "%s · Aiwa Creators",
  },
  description:
    "AI-assisted image, video, and voice generation for Aiwa Media Group and its clients.",
  metadataBase: new URL(
    process.env.APP_URL ?? "https://creator.aiwamediagroup.com",
  ),
  manifest: "/manifest.webmanifest",
  icons: {
    shortcut: "/brand/icons/compatibility/favicon.ico",
    apple: "/brand/icons/compatibility/apple-touch-icon-180x180.png",
    icon: [
      {
        url: "/brand/icons/favicon/creators-favicon-32x32-transparent.webp",
        type: "image/webp",
        sizes: "32x32",
      },
      {
        url: "/brand/icons/favicon/creators-favicon-64x64-transparent.webp",
        type: "image/webp",
        sizes: "64x64",
      },
    ],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          id="aiwa-theme-boot"
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
      </head>
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
