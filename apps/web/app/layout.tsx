import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { createSiteMetadata, siteViewport } from "../lib/metadata";
import { getRequestLocale } from "../lib/locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return createSiteMetadata(await getRequestLocale());
}

export const viewport: Viewport = siteViewport;

const VIBELOFT_PRODUCT_ID = "e3e05646-24b9-4532-9068-d8f29cad72f3";
// VibeLoft's Web identity is a public, origin-scoped write key. Keep the
// environment override so a future rotation does not require a source edit.
const VIBELOFT_WEB_AUTH_KEY =
  process.env.NEXT_PUBLIC_VIBELOFT_WEB_AUTH_KEY ??
  "vl_web.BZ60PAAtY-EYmi-hP8yKqjG6RV0UdIZABZ56pA30_0M";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {children}
        <Script
          src="https://vibeloft.ai/telemetry/v1.js"
          strategy="afterInteractive"
          data-vl-product-id={VIBELOFT_PRODUCT_ID}
          data-vl-auth-key={VIBELOFT_WEB_AUTH_KEY}
        />
      </body>
    </html>
  );
}
