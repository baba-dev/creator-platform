import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
