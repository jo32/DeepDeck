import Image from "next/image";
import { localePath, type SiteLocale } from "../../lib/locale";
import { serializeStructuredData } from "../../lib/structured-data";
import { ChangelogSection, WebMCPSection } from "./product-updates";

const githubUrl = "https://github.com/jo32/DeepDeck";
const releaseUrl = `${githubUrl}/releases/latest`;
const hackerNewsRepoUrl = "https://github.com/jo32/dsh-hackernews-reader";
const hackerNewsInstallSource = `${hackerNewsRepoUrl}.git`;
const videoSherlockRepoUrl = "https://github.com/jo32/dsh-video-sherlock";
const videoSherlockInstallSource = `${videoSherlockRepoUrl}.git`;
const appsProtocolUrl = `${githubUrl}/blob/main/docs/apps-protocol.md`;

const installableApps = [
  {
    name: "Hacker News Reader",
    repoUrl: hackerNewsRepoUrl,
    installSource: hackerNewsInstallSource,
  },
  {
    name: "Video Sherlock",
    repoUrl: videoSherlockRepoUrl,
    installSource: videoSherlockInstallSource,
  },
] as const;

const stories = [
  {
    rank: "01",
    title: "Show HN: I built a tiny search engine for my notes",
    meta: "312 points · 84 comments",
  },
  {
    rank: "02",
    title: "SQLite on the edge: what worked and what did not",
    meta: "246 points · 67 comments",
  },
  {
    rank: "03",
    title: "The quiet craft of building useful software",
    meta: "198 points · 42 comments",
  },
  {
    rank: "04",
    title: "Ask HN: What are you working on this week?",
    meta: "155 points · 193 comments",
  },
];

const copy = {
  zh: {
    nav: {
      simple: "简约",
      apps: "Apps",
      install: "安装",
      vibe: "Vibe App",
      webmcp: "WebMCP",
      changelog: "更新日志",
      download: "下载 DeepDeck",
      downloadShort: "下载",
    },
    language: {
      lang: "en",
      label: "EN",
      ariaLabel: "Switch to English",
    },
    interface: {
      eyebrow: "DeepDeck 是开源、本地运行的 AI 工作台。",
      title: ["DeepSeek Harness", "桌面客户端。"],
      body: "工作区、模式、模型和输入，被收进一条自然的操作路径。DeepDeck 兼容现有 Harness 设置与插件生态，完成引导式首次设置后即可开始工作。",
      github: "查看 GitHub",
      imageAlt: "DeepDeck 简约桌面界面",
      announcement: "开发预览：Browser + WebMCP",
    },
    apps: {
      title: ["支持", "App。"],
      body: "DeepDeck App 是一种可安装扩展，可以拥有独立窗口、独立设置，以及自己的 AI 对话。Hacker News Reader 就是一个完整示例。",
      explain: "解释",
      summarize: "总结",
      note: "同一个 App 里，阅读内容、搜索、登录，以及“解释 / 总结”AI Actions 都有自己的位置。",
    },
    showcase: {
      title: ["典型", "Apps。"],
      body: "App 把一种具体工作方式装进 DeepDeck：独立窗口承载界面，Workspace 保存上下文，Agent 在关键节点接手推理。",
      cards: [
        {
          eyebrow: "阅读与研究",
          title: "Hacker News Reader",
          description: "浏览实时榜单、搜索故事、展开完整评论树，并把文章、评论或选中文字交给 Agent 解释和总结。",
          status: "可安装",
          features: ["实时 Feed", "完整评论树", "解释 / 总结"],
          imageAlt: "DeepDeck Hacker News Reader App 的阅读与 AI 操作界面",
          image: "/showcase/hacker-news-reader.png",
        },
        {
          eyebrow: "长任务调查",
          title: "Video Sherlock",
          description: "把长视频调查组织成可跟踪的 case，在任务运行时查看进度，并沿证据时间轴回到关键片段。",
          status: "可安装",
          features: ["可见进度", "证据时间轴", "结构化产物"],
          imageAlt: "Video Sherlock 长视频调查 App 的证据控制台",
          image: "/showcase/video-sherlock.png",
        },
      ],
      repository: "查看源码",
      install: "安装这个 App",
      note: "每个 App 都可以拥有自己的设置、凭据、标准 Harness Session 和绑定源码的 Creator Workspace。",
    },
    install: {
      title: ["装上一个", "App。"],
      body: "不需要命令行。DeepDeck 会先检查源码、包身份和构建命令，只有在你确认后才执行安装。",
      steps: [
        ["01", "下载 DeepDeck", "安装最新版本，并完成首次启动设置。"],
        ["02", "打开 Apps 设置", "进入 Settings → Apps，找到安装入口。"],
        ["03", "选择并粘贴源码", "从下方两个开源 App 中选择一个，粘贴对应 Git 地址。"],
        ["04", "检查并确认", "选择 Inspect source，核对构建计划后 Confirm install，并按提示重启。"],
      ],
      sourceLabel: "APP SOURCE",
      sourceHint: "选择一个开源 App，把它的 Git 地址粘贴到 Install an App plugin",
      finish: "重启后，从侧栏 Apps 打开刚安装的 App。",
      download: "先下载 DeepDeck",
      repository: "打开 App 源码",
      developerTitle: "想从源码开发，或做一个自己的 App？",
      developerBody: "Settings → Apps → New App 会生成完整的 Cordis Host / Client 骨架；开发者也可以手动构建并挂载公开 App 源码。",
      developerLink: "阅读 Apps 协议",
      sourceInstallTitle: "开发者：手动安装示例",
      sourceInstallNote: "最后一步需要在 DeepDeck 管理的 web profile 中执行，这样 App runtime 才会可用。",
    },
    vibe: {
      title: ["现场 Vibe", "一个 App。"],
      body: "Vibe Coding 是 AI 辅助的 App 构建流程。在 Hacker News 的设置里打开它，DeepDeck 会绑定源码工作区；说出修改后，Agent 写代码、Bun 构建，Cordis 原地热更新。",
      steps: [
        ["打开 Creator", "源码工作区自动绑定"],
        ["描述想法", "Agent 直接修改 App"],
        ["构建并热更新", "不用重启 DeepDeck"],
      ],
      entryCaption: "从 Vibe Coding 进入 Creator",
      entryAlt: "Hacker News App 设置中的 Vibe Coding 入口",
      resultCaption: "这次真实构建用时 2007ms",
      resultAlt: "Creator 模式完成 Hacker News App 的 Bun 构建与热更新",
    },
    closing: {
      lineOne: "简单地工作。",
      lineTwo: "把想法变成 App。",
      note: "工作、浏览、构建，都在一个桌面。",
    },
    aria: {
      home: "DeepDeck 首页",
      navigation: "主导航",
      backToTop: "返回页面顶部",
    },
  },
  en: {
    nav: {
      simple: "Simple",
      apps: "Apps",
      install: "Install",
      vibe: "Vibe App",
      webmcp: "WebMCP",
      changelog: "What’s new",
      download: "Download DeepDeck",
      downloadShort: "Download",
    },
    language: {
      lang: "zh-CN",
      label: "中文",
      ariaLabel: "切换到中文",
    },
    interface: {
      eyebrow: "DeepDeck is an open-source, local AI workbench.",
      title: ["The desktop client", "for DeepSeek Harness."],
      body: "Workspaces, modes, models, and the prompt all fall into one natural flow. DeepDeck keeps existing Harness settings and extensions compatible; after guided first-run setup, it is ready for work.",
      github: "View on GitHub",
      imageAlt: "The focused DeepDeck desktop interface",
      announcement: "In preview: Browser + WebMCP",
    },
    apps: {
      title: ["Supports", "Apps."],
      body: "A DeepDeck App is an installable extension with its own window, settings, and AI conversations. Hacker News Reader is a complete example.",
      explain: "Explain",
      summarize: "Summarize",
      note: "Reading, search, sign-in, and AI Actions such as Explain and Summarize all live inside the same App.",
    },
    showcase: {
      title: ["Apps", "in action."],
      body: "An App brings one focused way of working into DeepDeck: a dedicated window for the interface, a Workspace for context, and an Agent at the moments that need reasoning.",
      cards: [
        {
          eyebrow: "READING + RESEARCH",
          title: "Hacker News Reader",
          description: "Browse live feeds, search stories, follow complete discussion trees, and ask the Agent to explain or summarize any story, comment, or selection.",
          status: "INSTALLABLE",
          features: ["Live feeds", "Full threads", "Explain / Summarize"],
          imageAlt: "The DeepDeck Hacker News Reader App with reading and AI actions",
          image: "/showcase/hacker-news-reader.png",
        },
        {
          eyebrow: "LONG-RUNNING INVESTIGATION",
          title: "Video Sherlock",
          description: "Turn long-form video investigation into a trackable case, watch work progress, and return to key moments on an evidence timeline.",
          status: "INSTALLABLE",
          features: ["Visible progress", "Evidence timeline", "Structured artifacts"],
          imageAlt: "The Video Sherlock evidence console for long-running video investigation",
          image: "/showcase/video-sherlock.png",
        },
      ],
      repository: "View source",
      install: "Install this App",
      note: "Each App can own its settings, credentials, canonical Harness Sessions, and a source-bound Creator Workspace.",
    },
    install: {
      title: ["Install an App", "in minutes."],
      body: "No terminal required. DeepDeck inspects the source, package identity, and build command first, then installs only after you approve the plan.",
      steps: [
        ["01", "Download DeepDeck", "Install the latest release and complete first-run setup."],
        ["02", "Open Apps settings", "Go to Settings → Apps and find the install control."],
        ["03", "Choose and paste a source", "Pick either open-source App below and paste its Git address."],
        ["04", "Inspect and confirm", "Choose Inspect source, review the build plan, then Confirm install and restart when prompted."],
      ],
      sourceLabel: "APP SOURCE",
      sourceHint: "Choose an open-source App and paste its Git address into Install an App plugin",
      finish: "After restart, open the newly installed App from the Apps sidebar.",
      download: "Download DeepDeck first",
      repository: "Open App source",
      developerTitle: "Develop from source—or make an App of your own.",
      developerBody: "Settings → Apps → New App generates a complete Cordis Host / Client starter. Developers can also build and mount a public App source manually.",
      developerLink: "Read the Apps protocol",
      sourceInstallTitle: "Developer: manual install example",
      sourceInstallNote: "Run the final command against a DeepDeck-managed web profile so the required App runtime is present.",
    },
    vibe: {
      title: ["Vibe", "an App."],
      body: "Vibe Coding is DeepDeck's AI-assisted app-building workflow. Open it from Hacker News settings to bind the source workspace; describe a change, and the Agent writes code while Bun and Cordis rebuild and hot-reload it.",
      steps: [
        ["Open Creator", "The source workspace is bound automatically"],
        ["Describe the idea", "The Agent edits the App directly"],
        ["Build and hot-reload", "No DeepDeck restart required"],
      ],
      entryCaption: "Open Creator from Vibe Coding",
      entryAlt: "The Vibe Coding entry point in Hacker News App settings",
      resultCaption: "This real build completed in 2007ms",
      resultAlt: "Creator completing the Hacker News App Bun build and hot reload",
    },
    closing: {
      lineOne: "Work simply.",
      lineTwo: "Turn ideas into Apps.",
      note: "Work, browse, and build. One desktop.",
    },
    aria: {
      home: "DeepDeck home",
      navigation: "Main navigation",
      backToTop: "Back to the top",
    },
  },
} as const;

export function LandingPage({ locale }: { locale: SiteLocale }) {
  const content = copy[locale];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(locale) }}
      />
      <header className="site-header">
        <div className="nav-shell">
          <a className="brand" href="#interface" aria-label={content.aria.home}>
            <Image src="/brand/mark.svg" alt="" width={27} height={27} loading="eager" />
            <span>DeepDeck</span>
          </a>
          <nav className="nav-links" aria-label={content.aria.navigation}>
            <a href="#webmcp">{content.nav.webmcp}</a>
            <a href="#showcase">{content.nav.apps}</a>
            <a href="#install">{content.nav.install}</a>
            <a href="#vibe">{content.nav.vibe}</a>
            <a href="#updates">{content.nav.changelog}</a>
          </nav>
          <div className="nav-actions">
            <a
              className="language-link"
              href={locale === "en" ? localePath.zh : localePath.en}
              hrefLang={content.language.lang}
              lang={content.language.lang}
              aria-label={content.language.ariaLabel}
            >
              {content.language.label}
            </a>
            <a className="nav-cta" href={releaseUrl} target="_blank" rel="noreferrer">
              <span className="nav-cta-long">{content.nav.download}</span>
              <span className="nav-cta-short">{content.nav.downloadShort}</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </header>

      <main>
        <section id="interface" className="story story-first page-shell">
          <div className="story-heading hero-heading">
            <div className="story-index">
              <span>01</span>
              <span>SIMPLE</span>
            </div>
            <div className="story-title">
              <p className="eyebrow">{content.interface.eyebrow}</p>
              <h1>
                {content.interface.title[0]}{" "}
                <span>{content.interface.title[1]}</span>
              </h1>
            </div>
            <div className="story-copy">
              <p>{content.interface.body}</p>
              <div className="hero-actions">
                <a className="button button-primary" href={releaseUrl} target="_blank" rel="noreferrer">
                  {content.nav.download} <span aria-hidden="true">↗</span>
                </a>
                <a className="button button-secondary" href={githubUrl} target="_blank" rel="noreferrer">
                  {content.interface.github} <span aria-hidden="true">→</span>
                </a>
              </div>
              <a className="feature-announcement" href="#webmcp">
                {content.interface.announcement} <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="interface-stage">
            <div className="stage-grid" aria-hidden="true" />
            <div className="product-window">
              <div className="product-titlebar">
                <div className="traffic-lights" aria-hidden="true"><span /><span /><span /></div>
                <span>DeepDeck</span>
                <span className="local-state"><i /> Local</span>
              </div>
              <Image
                src="/deepdeck-app.png"
                alt={content.interface.imageAlt}
                width={1659}
                height={948}
                sizes="(max-width: 768px) 94vw, 1200px"
                loading="eager"
              />
            </div>
          </div>
        </section>

        <WebMCPSection locale={locale} />

        <section id="apps" className="story story-app page-shell">
          <div className="story-heading">
            <div className="story-index">
              <span>03</span>
              <span>APP SUPPORT</span>
            </div>
            <div className="story-title">
              <h2>
                {content.apps.title[0]}{" "}
                <span>{content.apps.title[1]}</span>
              </h2>
            </div>
            <div className="story-copy">
              <p>{content.apps.body}</p>
            </div>
          </div>

          <div className="hn-window" aria-hidden="true">
            <div className="hn-titlebar">
              <div className="traffic-lights" aria-hidden="true"><span /><span /><span /></div>
              <span>Hacker News</span>
              <span>DeepDeck App</span>
            </div>
            <div className="hn-body">
              <aside className="hn-sidebar">
                <div className="hn-logo">Y</div>
                <strong>Hacker News</strong>
                <nav>
                  <span className="hn-nav-active">Top stories</span>
                  <span>New</span>
                  <span>Best</span>
                  <span>Ask HN</span>
                  <span>Show HN</span>
                  <span>Jobs</span>
                </nav>
                <small>App workspace connected</small>
              </aside>
              <div className="hn-feed">
                <div className="hn-feed-header">
                  <div>
                    <span>TOP STORIES</span>
                    <h3>Today on Hacker News</h3>
                  </div>
                  <span className="hn-search" aria-hidden="true">Search</span>
                </div>
                <div className="story-list">
                  {stories.map((story) => (
                    <article className="hn-story" key={story.rank}>
                      <span className="hn-rank">{story.rank}</span>
                      <div>
                        <h4>{story.title}</h4>
                        <p>{story.meta}</p>
                      </div>
                      <div className="hn-ai-actions" aria-hidden="true">
                        <span>{content.apps.explain}</span>
                        <span>{content.apps.summarize}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="example-note">{content.apps.note}</p>
        </section>

        <section id="showcase" className="story story-showcase">
          <div className="page-shell">
            <div className="story-heading">
              <div className="story-index">
                <span>04</span>
                <span>APP SHOWCASE</span>
              </div>
              <div className="story-title">
                <h2>
                  {content.showcase.title[0]}{" "}
                  <span>{content.showcase.title[1]}</span>
                </h2>
              </div>
              <div className="story-copy">
                <p>{content.showcase.body}</p>
              </div>
            </div>

            <div className="showcase-grid">
              {content.showcase.cards.map((app, index) => (
                <article className="showcase-card" key={app.title}>
                  <div className="showcase-image">
                    <Image
                      src={app.image}
                      alt={app.imageAlt}
                      width={1270}
                      height={760}
                      sizes="(max-width: 720px) 94vw, (max-width: 1200px) 46vw, 570px"
                    />
                  </div>
                  <div className="showcase-card-body">
                    <div className="showcase-kicker">
                      <span>{app.eyebrow}</span>
                      <span>{app.status}</span>
                    </div>
                    <h3>{app.title}</h3>
                    <p>{app.description}</p>
                    <ul className="showcase-features" aria-label={`${app.title} features`}>
                      {app.features.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                    <div className="showcase-actions">
                      <a className="text-link" href="#install">
                        {content.showcase.install} <span aria-hidden="true">↓</span>
                      </a>
                      <a
                        className="text-link text-link-muted"
                        href={index === 0 ? hackerNewsRepoUrl : videoSherlockRepoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {content.showcase.repository} <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="showcase-note">{content.showcase.note}</p>
          </div>
        </section>

        <section id="install" className="story story-install page-shell">
          <div className="story-heading">
            <div className="story-index">
              <span>05</span>
              <span>INSTALL</span>
            </div>
            <div className="story-title">
              <h2>
                {content.install.title[0]}{" "}
                <span>{content.install.title[1]}</span>
              </h2>
            </div>
            <div className="story-copy">
              <p>{content.install.body}</p>
            </div>
          </div>

          <ol className="install-steps">
            {content.install.steps.map(([number, title, description]) => (
              <li key={number}>
                <span>{number}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="install-source-card">
            <div>
              <span>{content.install.sourceLabel}</span>
              <p>{content.install.sourceHint}</p>
            </div>
            <div className="install-source-list">
              {installableApps.map((app) => (
                <div className="install-source-row" key={app.name}>
                  <div>
                    <strong>{app.name}</strong>
                    <code>{app.installSource}</code>
                  </div>
                  <a href={app.repoUrl} target="_blank" rel="noreferrer" aria-label={`${content.install.repository}: ${app.name}`}>
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              ))}
            </div>
            <div className="install-finish">
              <p>{content.install.finish}</p>
              <div>
                <a className="button button-primary" href={releaseUrl} target="_blank" rel="noreferrer">
                  {content.install.download} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>

          <div className="developer-install">
            <div>
              <span>BUILD YOUR OWN</span>
              <h3>{content.install.developerTitle}</h3>
              <p>{content.install.developerBody}</p>
              <a className="text-link" href={appsProtocolUrl} target="_blank" rel="noreferrer">
                {content.install.developerLink} <span aria-hidden="true">↗</span>
              </a>
            </div>
            <details className="manual-install">
              <summary>{content.install.sourceInstallTitle}</summary>
              <pre><code>{`git clone ${hackerNewsInstallSource}\ncd dsh-hackernews-reader\npnpm install --frozen-lockfile\npnpm check && pnpm test && pnpm build\ndsh plugin --profile web add "$PWD"`}</code></pre>
              <p>{content.install.sourceInstallNote}</p>
            </details>
          </div>
        </section>

        <section id="vibe" className="story story-vibe">
          <div className="page-shell">
            <div className="story-heading story-heading-dark">
              <div className="story-index">
                <span>06</span>
                <span>VIBE APP</span>
              </div>
              <div className="story-title">
                <h2>
                  {content.vibe.title[0]}{" "}
                  <span>{content.vibe.title[1]}</span>
                </h2>
              </div>
              <div className="story-copy">
                <p>{content.vibe.body}</p>
              </div>
            </div>

            <ol className="vibe-steps">
              {content.vibe.steps.map(([title, description], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </li>
              ))}
            </ol>

            <div className="vibe-proof">
              <figure className="proof-card proof-entry">
                <figcaption>
                  <span>HACKER NEWS / SETTINGS</span>
                  <strong>{content.vibe.entryCaption}</strong>
                </figcaption>
                <Image
                  src="/examples/hacker-news-app-settings.png"
                  alt={content.vibe.entryAlt}
                  width={780}
                  height={410}
                  sizes="(max-width: 768px) 94vw, 540px"
                />
              </figure>
              <figure className="proof-card proof-result">
                <figcaption>
                  <span>CREATOR / REBUILD</span>
                  <strong>{content.vibe.resultCaption}</strong>
                </figcaption>
                <Image
                  src="/examples/hacker-news-vibe-rebuild.png"
                  alt={content.vibe.resultAlt}
                  width={1208}
                  height={768}
                  sizes="(max-width: 768px) 94vw, 720px"
                />
              </figure>
            </div>

            <div className="closing">
              <div>
                <span>THAT&apos;S DEEPDECK.</span>
                <h2>{content.closing.lineOne}<br />{content.closing.lineTwo}</h2>
              </div>
              <div className="closing-action">
                <p>{content.closing.note}</p>
                <a className="button button-light" href={releaseUrl} target="_blank" rel="noreferrer">
                  {content.nav.download} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <ChangelogSection locale={locale} />
      </main>

      <footer className="site-footer page-shell">
        <a className="brand" href="#interface" aria-label={content.aria.backToTop}>
          <Image src="/brand/mark.svg" alt="" width={25} height={25} />
          <span>DeepDeck</span>
        </a>
        <p>Built on DeepSeek Harness. Composed with Cordis.</p>
        <div className="footer-links">
          <a href="#webmcp">{content.nav.webmcp}</a>
          <a href="#updates">{content.nav.changelog}</a>
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${githubUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>
        </div>
      </footer>
    </>
  );
}
