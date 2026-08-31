import Script from "next/script";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { documentLanguage, type SiteLocale } from "../../lib/locale";

export function RootDocument({
  children,
  locale,
}: Readonly<{ children: React.ReactNode; locale: SiteLocale }>) {
  return (
    <html
      lang={documentLanguage[locale]}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>{children}</body>
      <Script
        src="https://vibeloft.ai/telemetry/v1.js"
        data-vl-product-id="e3e05646-24b9-4532-9068-d8f29cad72f3"
        data-vl-auth-key="vl_web.aG8MCcrdvUfIrYUQX4n8J5WZ_dJWLV41G_MqCrd4ILA"
        strategy="lazyOnload"
      />
    </html>
  );
}
