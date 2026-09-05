import type { SiteLocale } from "./locale";

export type ProductUpdate = {
  id: string;
  /** ISO calendar date. Keep entries newest first. */
  date: `${number}-${number}-${number}`;
  status: "development-preview" | "released";
  href: string;
  sourceHref?: string;
  content: Record<SiteLocale, {
    category: string;
    title: string;
    description: string;
    highlights: readonly string[];
    linkLabel: string;
  }>;
};

export const webmcpSourceUrl = "https://github.com/jo32/DeepDeck/tree/codex/browser-webmcp";

export const productUpdates: readonly ProductUpdate[] = [
  {
    id: "webmcp-browser-agent",
    date: "2026-09-05",
    status: "development-preview",
    href: "#webmcp",
    sourceHref: webmcpSourceUrl,
    content: {
      zh: {
        category: "BROWSER / WEBMCP",
        title: "网站，也可以拥有自己的 Agent。",
        description: "DeepDeck 新增 Browser 与 WebMCP Builder：在网站旁边直接对话，把发现的页面能力变成以后还能继续使用的工具。",
        highlights: [
          "每个网站保留独立的 Agent 对话，在同一段对话里切换 Use 与 Builder。",
          "先发现已有 WebMCP；Builder 为缺少的能力生成带类型定义的工具，Apply 验证注册后按网站保存。",
          "覆盖登录、搜索与草稿编辑等交互；Agent 读取、编辑、回填并复查，填写与提交分开。",
        ],
        linkLabel: "了解 WebMCP",
      },
      en: {
        category: "BROWSER / WEBMCP",
        title: "A dedicated Agent for your websites.",
        description: "Browser and WebMCP Builder bring the conversation alongside the page, turning discovered website capabilities into tools you can use again.",
        highlights: [
          "Each website keeps its own Agent conversation, with Use and Builder in the same thread.",
          "Discover existing WebMCP tools first. Builder creates missing tools with typed parameters; Apply verifies registration and saves them for that site.",
          "Cover sign-in, search, and draft editing. The Agent reads, edits, fills, and checks the result, with filling separate from submitting.",
        ],
        linkLabel: "Explore WebMCP",
      },
    },
  },
];

export const updateStatusLabels: Record<SiteLocale, Record<ProductUpdate["status"], string>> = {
  zh: { "development-preview": "开发预览", released: "已发布" },
  en: { "development-preview": "Development preview", released: "Released" },
};
