import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/caveat";
import "@fontsource-variable/manrope";

import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
