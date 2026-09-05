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

export const webmcpSourceUrl = "https://github.com/jo32/DeepDeck/tree/v1.0.38";

export const webmcpReleaseUrl = "https://github.com/jo32/DeepDeck/releases/tag/v1.0.38";

export const productUpdates: readonly ProductUpdate[] = [
  {
    id: "webmcp-v1-0-38",
    date: "2026-09-06",
    status: "released",
    href: webmcpReleaseUrl,
    sourceHref: webmcpSourceUrl,
    content: {
      zh: {
        category: "V1.0.38 / BROWSER / WEBMCP",
        title: "Browser + WebMCP，现已正式发布。",
        description: "在 v1.0.38 中使用网站 Agent 与 WebMCP Builder：从阅读、搜索到编辑和登录，让网站能力成为可复用的工具。",
        highlights: [
          "Apple Silicon 与 Intel Mac 安装包均已签名、公证，现有用户可通过应用内更新升级。",
          "Builder 发现输入框、草稿和登录入口；Agent 完成读取、编辑、回填与复查，填写和提交分开。",
          "编辑前检测草稿和目标变化；需要原生输入的编辑器由 Agent 接续操作，并验证页面结果。",
        ],
        linkLabel: "下载 v1.0.38",
      },
      en: {
        category: "V1.0.38 / BROWSER / WEBMCP",
        title: "Browser + WebMCP is now available.",
        description: "Use the Site Agent and WebMCP Builder in v1.0.38 to turn reading, search, editing, and sign-in workflows into reusable website tools.",
        highlights: [
          "Signed and notarized installers for Apple Silicon and Intel Macs, with in-app updates for existing users.",
          "Builder discovers inputs, drafts, and sign-in controls. The Agent reads, edits, fills, and checks, with submission as a separate action.",
          "Detect draft and target changes before editing. The Agent continues through native browser input when needed and verifies the page result.",
        ],
        linkLabel: "Download v1.0.38",
      },
    },
  },
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
