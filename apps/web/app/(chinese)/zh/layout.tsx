import type { Metadata, Viewport } from "next";
import { RootDocument } from "../../_components/root-document";
import { createSiteMetadata, siteViewport } from "../../../lib/metadata";
import "../../globals.css";

export const metadata: Metadata = createSiteMetadata("zh");
export const viewport: Viewport = siteViewport;

export default function ChineseRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootDocument locale="zh">{children}</RootDocument>;
}
