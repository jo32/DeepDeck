import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { createSiteMetadata, siteViewport } from "../lib/metadata";
import { getRequestLocale } from "../lib/locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return createSiteMetadata(await getRequestLocale());
}

export const viewport: Viewport = siteViewport;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script
          defer
          src="https://vibeloft.ai/telemetry/v1.js"
          data-vl-product-id="e3e05646-24b9-4532-9068-d8f29cad72f3"
          data-vl-auth-key="vl_web.aG8MCcrdvUfIrYUQX4n8J5WZ_dJWLV41G_MqCrd4ILA"
        ></script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
