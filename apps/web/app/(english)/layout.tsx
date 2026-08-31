import type { Metadata, Viewport } from "next";
import { RootDocument } from "../_components/root-document";
import { createSiteMetadata, siteViewport } from "../../lib/metadata";
import "../globals.css";

export const metadata: Metadata = createSiteMetadata("en");
export const viewport: Viewport = siteViewport;

export default function EnglishRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
