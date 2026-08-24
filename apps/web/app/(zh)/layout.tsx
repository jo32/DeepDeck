import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { createSiteMetadata, siteViewport } from "../../lib/metadata";
import "../globals.css";

export const metadata: Metadata = createSiteMetadata("zh");
export const viewport: Viewport = siteViewport;

export default function ChineseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
