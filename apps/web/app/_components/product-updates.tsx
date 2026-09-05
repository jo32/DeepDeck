import Image from "next/image";
import type { SiteLocale } from "../../lib/locale";
import { productUpdates, updateStatusLabels, webmcpSourceUrl } from "../../lib/product-updates";

const copy = {
  zh: {
    title: ["让网站", "成为工具。"],
    body: "在 DeepDeck Browser 中打开网站，旁边就有属于这个网站的 Agent。用自然语言阅读、搜索或处理页面，把可复用的操作交给 WebMCP。",
    preview: "开发预览",
    availability: "目前可从源码体验，尚未包含在已发布的安装包中。",
    source: "从源码体验",
    workflowLabel: "WebMCP 使用流程",
    steps: [
      ["先发现，再构建", "Agent 优先发现已有工具。缺少某项能力时，切换 Builder，让它检查页面并生成对应工具。"],
      ["验证后，继续使用", "Apply 会验证工具是否成功注册。工具按网站保存，切回 Use 就能在同一段对话中继续工作。"],
      ["读、编辑、回填、复查", "搜索框、草稿与登录入口也属于可操作能力。Agent 可以编辑内容并写回页面；填写和提交是独立操作。"],
    ],
    images: [
      { title: "从网站出发，与 Agent 一起工作", caption: "浏览器首页集中展示常用网站、Site Agent 和 WebMCP Builder 入口。", alt: "DeepDeck Browser 首页展示网站快捷入口、Site Agent 和 WebMCP Builder", src: "/webmcp/browser-start.jpg" },
      { title: "为网站留下可复用的工具", caption: "NGA 示例保留 4 个读取工具，并新增 4 个登录相关工具。", alt: "DeepDeck 中 NGA 网站的 WebMCP 工具列表", src: "/webmcp/site-tools.jpg" },
      { title: "发现页面上的交互入口", caption: "NGA 示例支持打开登录窗口，以及切换密码与 App 扫码方式。", alt: "NGA 网站在 DeepDeck Browser 中显示登录界面", src: "/webmcp/login-flow.jpg" },
    ],
    fullImage: "查看完整截图",
    example: "以 NGA 为例",
    exampleBody: "Agent 可以读取论坛内容，也可以打开登录窗口、选择密码或 App 扫码方式。账号、验证码和协议操作在网站原生页面中处理，再根据页面结果复查登录状态。具体工具由实际页面能力决定。",
    changelogTitle: ["看看", "最近更新。"],
    changelogBody: "新功能、重要改进和实际用法，持续记录在这里。开发预览与正式发布会分别标明。",
    changelogPreview: "此功能为源码开发预览，尚未随安装包发布。",
    changelogSource: "查看源码",
  },
  en: {
    title: ["Your browser,", "with an Agent."],
    body: "Open a website in DeepDeck Browser and work alongside its dedicated Agent. Read, search, or work with the page in natural language, and keep useful actions as reusable WebMCP tools.",
    preview: "Development preview",
    availability: "Available to try from source; not yet included in published installers.",
    source: "Try from source",
    workflowLabel: "WebMCP workflow",
    steps: [
      ["Discover, then build", "The Agent looks for existing tools first. When a capability is missing, switch to Builder to inspect the page and create the tools it needs."],
      ["Verify, then reuse", "Apply verifies that tools register successfully. They are saved per website, ready to use when you return to Use in the same conversation."],
      ["Read, edit, fill, check", "Search fields, drafts, and sign-in controls are part of the workflow. The Agent can edit and write back to the page; filling and submitting are separate actions."],
    ],
    images: [
      { title: "Start with a website, go further with an Agent", caption: "The browser home brings your sites, Site Agent, and WebMCP Builder into one place.", alt: "DeepDeck Browser home with website shortcuts, Site Agent, and WebMCP Builder", src: "/webmcp/browser-start.jpg" },
      { title: "Tools that stay with the website", caption: "The NGA example keeps four reading tools and adds four sign-in tools.", alt: "The WebMCP tool list for NGA in DeepDeck", src: "/webmcp/site-tools.jpg" },
      { title: "Bring page interactions into reach", caption: "The NGA example opens sign-in and switches between password and app QR login.", alt: "The NGA sign-in interface open in DeepDeck Browser", src: "/webmcp/login-flow.jpg" },
    ],
    fullImage: "View full screenshot",
    example: "NGA IN PRACTICE",
    exampleBody: "The Agent can read forum content, open sign-in, and choose password or app QR login. Continue with credentials, verification, and agreements on the website’s own page, then check the resulting sign-in state. Available tools depend on the actual website.",
    changelogTitle: ["What’s new", "in DeepDeck."],
    changelogBody: "New capabilities, meaningful improvements, and how to use them. Development previews and published features are labeled separately.",
    changelogPreview: "This feature is a source development preview and has not shipped in an installer yet.",
    changelogSource: "View source",
  },
} as const;

export function WebMCPSection({ locale }: { locale: SiteLocale }) {
  const content = copy[locale];

  return (
    <section id="webmcp" className="story story-webmcp" aria-labelledby="webmcp-title">
      <div className="page-shell">
        <div className="story-heading">
          <div className="story-index"><span>02</span><span>WEBMCP</span></div>
          <div className="story-title">
            <p className="eyebrow"><span className="preview-badge">{content.preview}</span></p>
            <h2 id="webmcp-title">{content.title[0]} <span>{content.title[1]}</span></h2>
          </div>
          <div className="story-copy">
            <p>{content.body}</p>
            <a className="text-link webmcp-source-link" href={webmcpSourceUrl} target="_blank" rel="noreferrer">
              {content.source} <span aria-hidden="true">↗</span>
            </a>
            <p className="webmcp-availability">{content.availability}</p>
          </div>
        </div>

        <div className="webmcp-gallery">
          {content.images.map((item, index) => (
            <figure className={`webmcp-shot${index === 0 ? " webmcp-shot-main" : ""}`} key={item.src}>
              <a className="webmcp-image-link" href={item.src} target="_blank" rel="noreferrer" aria-label={`${content.fullImage}: ${item.title}`}>
                <Image src={item.src} alt={item.alt} width={1280} height={689} sizes={index === 0 ? "(max-width: 720px) 94vw, 1200px" : "(max-width: 720px) 94vw, 580px"} />
                <span className="screenshot-expand" aria-hidden="true">↗</span>
              </a>
              <figcaption>
                <span className="webmcp-shot-number" aria-hidden="true">0{index + 1}</span>
                <div><h3>{item.title}</h3><p>{item.caption}</p></div>
              </figcaption>
            </figure>
          ))}
        </div>

        <ol className="webmcp-steps" aria-label={content.workflowLabel}>
          {content.steps.map(([title, description], index) => (
            <li key={title}>
              <span aria-hidden="true">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <div className="webmcp-example"><span>{content.example}</span><p>{content.exampleBody}</p></div>
      </div>
    </section>
  );
}

export function ChangelogSection({ locale }: { locale: SiteLocale }) {
  const content = copy[locale];

  return (
    <section id="updates" className="story story-changelog page-shell" aria-labelledby="changelog-title">
      <div className="story-heading">
        <div className="story-index"><span>07</span><span>CHANGELOG</span></div>
        <div className="story-title"><h2 id="changelog-title">{content.changelogTitle[0]} <span>{content.changelogTitle[1]}</span></h2></div>
        <div className="story-copy"><p>{content.changelogBody}</p></div>
      </div>
      <div className="changelog-list">
        {productUpdates.map((update) => {
          const entry = update.content[locale];
          return (
            <article className="changelog-entry" id={`update-${update.id}`} key={update.id} aria-labelledby={`update-title-${update.id}`}>
              <div className="changelog-meta">
                <time dateTime={update.date}>{update.date.replaceAll("-", ".")}</time>
                <span className="preview-badge">{updateStatusLabels[locale][update.status]}</span>
              </div>
              <div className="changelog-content">
                <p className="changelog-category">{entry.category}</p>
                <h3 id={`update-title-${update.id}`}>{entry.title}</h3>
                <p>{entry.description}</p>
                <ul>{entry.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
                <div className="changelog-actions">
                  <a className="text-link" href={update.href}>{entry.linkLabel} <span aria-hidden="true">↗</span></a>
                  {update.sourceHref ? <a className="text-link text-link-muted" href={update.sourceHref} target="_blank" rel="noreferrer">{content.changelogSource} <span aria-hidden="true">↗</span></a> : null}
                </div>
                {update.status === "development-preview" ? <p className="changelog-availability">{content.changelogPreview}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
