import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { createSiteMetadata, siteViewport } from "../../lib/metadata";
import "../globals.css";

export const metadata: Metadata = createSiteMetadata("en");
export const viewport: Viewport = siteViewport;

export default function EnglishLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
