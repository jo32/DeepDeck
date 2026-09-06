import Image from "next/image";
import type { SiteLocale } from "../../lib/locale";
import { productUpdates, updateStatusLabels, webmcpReleaseUrl } from "../../lib/product-updates";

const webmcpProjectUrl = "https://github.com/webmachinelearning/webmcp";

const copy = {
  zh: {
    title: ["让 Agent 把使用经验", "保存成 WebMCP。"],
    body: "你提出目标，Agent 自己探索和使用网站，把验证过的操作经验保存成 WebMCP 工具，供后续任务复用。不必由人逐步教它怎么操作，让已有产品更容易 Agent 化。",
    preview: "已发布",
    availability: "支持 Apple Silicon 与 Intel Mac。",
    source: "下载最新版",
    definitionTitle: "什么是 WebMCP？",
    definition: "WebMCP 是一项提议中的 Web API：网站可以把 JavaScript 功能或 HTML 表单声明为带自然语言描述和结构化参数的工具。Agent 因而能知道网站能做什么、需要哪些输入，并在当前网页中调用工具，与用户共享页面和浏览器上下文。",
    projectLink: "了解 WebMCP 项目",
    philosophyTitle: "用过网站，就把经验留下来。",
    philosophy: "让 Agent build WebMCP，就像让它用过一遍网站后，把使用经验保存下来：如何搜索、读取结果、编辑并检查草稿。这些经验以可查看、可执行的工具保存，后续任务可以直接复用。人负责提出目标，Agent 负责探索方法、验证结果，并把有效的操作留下来。",
    learningLoop: ["探索网站", "实际使用", "验证结果", "保存为工具", "下次复用"],
    pathsLabel: "DeepDeck Browser 解决的两个问题",
    paths: [
      ["复用已有 WebMCP", "打开网站，在 Site Agent 的 WebMCP 标签中查看 Website 工具。切到 Use，用自然语言描述任务，Agent 就能调用网站已经提供的能力。"],
      ["快速为网站添加 WebMCP", "网站还没有工具？打开 WebMCP Builder 或切到 Builder，告诉 Agent 目标。它自己探索网站、尝试操作，把验证过的流程保存成工具，无需你逐步编写使用教程、修改网站源码或另行部署 MCP 服务。"],
    ],
    images: [
      { title: "自动发现网站已有的工具", caption: "打开 openai.com，DeepDeck 自动发现 search_openai，并将它列在 Website 下，供 Agent 使用。", alt: "DeepDeck 在 openai.com 自动发现 search_openai WebMCP 工具", src: "/webmcp/existing-webmcp.png" },
      { title: "Agent 自己探索、使用并验证", caption: "以 X 为例，提出搜索、读取帖子或编辑草稿的目标。Builder 在真实页面上探索和尝试，验证哪些操作能完成任务。", alt: "X 的 Site Agent 处于 Builder 模式，汇报 WebMCP 工具的构建与验证结果", src: "/webmcp/building-webmcp.png" },
      { title: "把使用经验保存为可复用工具", caption: "这个 X 示例把已验证的操作保存为 23 个工具，列在 Built with DeepDeck 下。启用后，再次访问自动加载，支持查看源码和回退版本。", alt: "WebMCP 标签中 Built with DeepDeck 分组列出为 X 构建的 23 个工具", src: "/webmcp/built-webmcp.png" },
      { title: "切回 Use，直接描述要做的事", caption: "输入“compose a hello world x post”，Agent 调用 WebMCP 准备 Hello, world! 👋 草稿。图中没有发布帖子；填写与提交是独立操作。", alt: "Use 模式调用 WebMCP，在 X 中准备 Hello world 草稿，未发布帖子", src: "/webmcp/use-webmcp.png" },
    ],
    fullImage: "查看完整截图",
    benefitsTitle: "模型更懂网站，操作更高效、更省 token。",
    comparison: "Computer use 通常需要反复读取截图或页面快照、定位控件、点击和输入。WebMCP 把搜索、读取帖子、编辑草稿等能力声明为工具，让模型按明确的参数调用，并读取结果。",
    benefits: [
      ["更懂功能", "工具名称、描述和参数直接告诉模型网站能做什么，以及如何使用。"],
      ["更高效，也更省 token", "在工具覆盖的任务中，减少反复读图、定位控件和多轮交互，可以缩短执行时间并降低 token 消耗。"],
      ["把探索经验留给下次任务", "Agent 验证过的操作成为可以反复调用的工具，让现有产品逐步具备 Agent 可用的能力。"],
    ],
    efficiencyNote: "实际收益取决于网站、工具设计和任务。需要时，Agent 仍可结合浏览器操作完成工作。",
    changelogTitle: ["看看", "最近更新。"],
    changelogBody: "新功能、重要改进和实际用法，持续记录在这里。开发预览与正式发布会分别标明。",
    changelogPreview: "此条记录为正式发布前的源码开发预览。",
    changelogSource: "查看源码",
  },
  en: {
    title: ["Let agents learn a site.", "Keep what works."],
    body: "You set the goal. The Agent explores and uses the website, then saves verified workflows as WebMCP tools for future tasks. No need to teach it every click: existing products become easier for agents to work with.",
    preview: "Available now",
    availability: "For Apple Silicon and Intel Macs.",
    source: "Download latest",
    definitionTitle: "What is WebMCP?",
    definition: "WebMCP is a proposed web API: websites expose JavaScript functions or HTML forms as tools with natural-language descriptions and structured parameters. Agents can discover what a site does, understand the inputs it needs, and call tools in the current page, sharing the user's interface and browser context.",
    projectLink: "Explore the WebMCP project",
    philosophyTitle: "Use the website. Save the experience.",
    philosophy: "Asking an Agent to build WebMCP is like asking it to use a website and preserve what it learned: how to search, read results, or edit and check a draft. That experience lives in inspectable, executable tools future tasks can reuse. You provide the goal; the Agent discovers the method, verifies the result, and keeps the operations that work.",
    learningLoop: ["Explore the site", "Try the workflow", "Verify the result", "Save as tools", "Reuse next time"],
    pathsLabel: "Two problems DeepDeck Browser solves",
    paths: [
      ["Reuse existing WebMCP", "Open a website and find its Website tools in Site Agent’s WebMCP tab. Switch to Use, describe your task, and the Agent can call the capabilities the site already provides."],
      ["Quickly add WebMCP to a website", "No tools yet? Open WebMCP Builder or switch to Builder and describe your goal. The Agent explores the site, tries its workflows, and saves verified operations as tools. No step-by-step manual, site source changes, or separate MCP server required."],
    ],
    images: [
      { title: "Discover tools the website already offers", caption: "On openai.com, DeepDeck automatically discovers search_openai and lists it under Website, ready for the Agent to use.", alt: "DeepDeck automatically discovers the search_openai WebMCP tool on openai.com", src: "/webmcp/existing-webmcp.png" },
      { title: "The Agent explores, uses, and verifies", caption: "On X, set a goal such as search, post reading, or draft editing. Builder explores the live page, tries the workflows, and checks which operations accomplish the task.", alt: "The X Site Agent in Builder mode reports WebMCP tool creation and verification", src: "/webmcp/building-webmcp.png" },
      { title: "Save the experience as reusable tools", caption: "This X example saves verified operations as 23 tools under Built with DeepDeck. Enabled tools load when you return, with source inspection and version rollback available.", alt: "The WebMCP tab lists 23 tools for X under Built with DeepDeck", src: "/webmcp/built-webmcp.png" },
      { title: "Switch to Use and describe your task", caption: "Ask “compose a hello world x post” and the Agent calls WebMCP to prepare a Hello, world! 👋 draft. The post is not published; filling and submitting are separate actions.", alt: "Use mode calls WebMCP to prepare a Hello world draft on X without publishing it", src: "/webmcp/use-webmcp.png" },
    ],
    fullImage: "View full screenshot",
    benefitsTitle: "Clearer capabilities. Faster actions. Fewer tokens.",
    comparison: "Computer use typically involves repeated screenshots or page snapshots, finding controls, clicking, and typing. WebMCP describes actions such as search, read a post, or edit a draft as tools the model can call with explicit arguments and read the results.",
    benefits: [
      ["Understand the website", "Tool names, descriptions, and parameters tell the model what the website can do and how to use it."],
      ["Work faster with fewer tokens", "For tasks covered by tools, fewer page inspections, control lookups, and interaction rounds can reduce execution time and token use."],
      ["Keep experience for the next task", "Operations the Agent has verified become tools it can call again, helping existing products become easier to use through an agent."],
    ],
    efficiencyNote: "Results depend on the website, tool design, and task. The Agent can still combine tools with browser interaction when needed.",
    changelogTitle: ["What’s new", "in DeepDeck."],
    changelogBody: "New capabilities, meaningful improvements, and how to use them. Development previews and published features are labeled separately.",
    changelogPreview: "This entry describes the source preview before its installer release.",
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
            <a className="text-link webmcp-source-link" href={webmcpReleaseUrl} target="_blank" rel="noreferrer">
              {content.source} <span aria-hidden="true">↗</span>
            </a>
            <p className="webmcp-availability">{content.availability}</p>
          </div>
        </div>

        <div className="webmcp-philosophy">
          <h3>{content.philosophyTitle}</h3>
          <p>{content.philosophy}</p>
          <ol className="webmcp-learning-loop">
            {content.learningLoop.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>

        <div className="webmcp-definition">
          <h3>{content.definitionTitle}</h3>
          <div>
            <p>{content.definition}</p>
            <a className="text-link" href={webmcpProjectUrl} target="_blank" rel="noreferrer">
              {content.projectLink} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <ol className="webmcp-paths" aria-label={content.pathsLabel}>
          {content.paths.map(([title, description], index) => (
            <li key={title}>
              <span className="eyebrow">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>

        <div className="webmcp-gallery">
          {content.images.map((item, index) => (
            <figure className="webmcp-shot" key={item.src}>
              <a className="webmcp-image-link" href={item.src} target="_blank" rel="noreferrer" aria-label={`${content.fullImage}: ${item.title}`}>
                <Image src={item.src} alt={item.alt} width={1369} height={925} sizes="(max-width: 720px) 94vw, (max-width: 1280px) 45vw, 580px" />
                <span className="screenshot-expand" aria-hidden="true">↗</span>
              </a>
              <figcaption>
                <span className="webmcp-shot-number" aria-hidden="true">0{index + 1}</span>
                <div><h3>{item.title}</h3><p>{item.caption}</p></div>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="webmcp-benefits-heading">
          <h3 id="webmcp-benefits-title">{content.benefitsTitle}</h3>
          <p>{content.comparison}</p>
        </div>
        <ul className="webmcp-steps" aria-labelledby="webmcp-benefits-title">
          {content.benefits.map(([title, description], index) => (
            <li key={title}>
              <span aria-hidden="true">0{index + 1}</span>
              <h4>{title}</h4>
              <p>{description}</p>
            </li>
          ))}
        </ul>
        <p className="webmcp-efficiency-note">{content.efficiencyNote}</p>
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
