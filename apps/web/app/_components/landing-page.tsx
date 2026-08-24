import Image from "next/image";

export type SiteLocale = "zh" | "en";

const githubUrl = "https://github.com/jo32/DeepDeck";
const releaseUrl = `${githubUrl}/releases/latest`;

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
      apps: "支持 App",
      vibe: "Vibe App",
      download: "下载 DeepDeck",
      downloadShort: "下载",
    },
    language: {
      href: "/en",
      hrefLang: "en",
      label: "EN",
      ariaLabel: "Switch to English",
    },
    interface: {
      eyebrow: "DeepDeck 是一个桌面 AI 工作台。",
      title: ["简约的", "界面交互。"],
      body: "工作区、模式、模型和输入，被收进一条自然的操作路径。打开 DeepDeck，不需要先理解一套复杂系统，直接开始工作。",
      github: "查看 GitHub",
      imageAlt: "DeepDeck 简约桌面界面",
    },
    apps: {
      title: ["支持", "App。"],
      body: "插件不必藏在工具列表里。它可以拥有独立窗口、独立设置，以及自己的 AI 对话。Hacker News Reader 就是一个完整的 DeepDeck App。",
      explain: "解释",
      summarize: "总结",
      note: "同一个 App 里，阅读内容、搜索、登录，以及“解释 / 总结”AI Actions 都有自己的位置。",
    },
    vibe: {
      title: ["现场 Vibe", "一个 App。"],
      body: "在 Hacker News 的设置里点击 Vibe Coding，DeepDeck 会打开绑定源码的 Creator Workspace。说出修改，Agent 写代码，Bun 构建，Cordis 原地热更新。",
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
      note: "一个桌面，三件事。",
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
      vibe: "Vibe App",
      download: "Download DeepDeck",
      downloadShort: "Download",
    },
    language: {
      href: "/",
      hrefLang: "zh-CN",
      label: "中文",
      ariaLabel: "切换到中文",
    },
    interface: {
      eyebrow: "DeepDeck is a desktop AI workbench.",
      title: ["A simpler", "way to interact."],
      body: "Workspaces, modes, models, and the prompt all fall into one natural flow. Open DeepDeck and start working—there is no system to learn first.",
      github: "View on GitHub",
      imageAlt: "The focused DeepDeck desktop interface",
    },
    apps: {
      title: ["Supports", "Apps."],
      body: "Plugins do not have to stay buried in a tools list. Each one can have its own window, settings, and AI conversations. Hacker News Reader is a complete DeepDeck App.",
      explain: "Explain",
      summarize: "Summarize",
      note: "Reading, search, sign-in, and AI Actions such as Explain and Summarize all live inside the same App.",
    },
    vibe: {
      title: ["Vibe", "an App."],
      body: "Click Vibe Coding in Hacker News settings. DeepDeck opens a Creator Workspace bound to its source. Describe the change, the Agent writes code, Bun builds it, and Cordis hot-reloads it in place.",
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
      note: "One desktop. Three things.",
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
      <header className="site-header">
        <div className="nav-shell">
          <a className="brand" href="#interface" aria-label={content.aria.home}>
            <Image src="/brand/mark.svg" alt="" width={27} height={27} loading="eager" />
            <span>DeepDeck</span>
          </a>
          <nav className="nav-links" aria-label={content.aria.navigation}>
            <a href="#interface">{content.nav.simple}</a>
            <a href="#apps">{content.nav.apps}</a>
            <a href="#vibe">{content.nav.vibe}</a>
            <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <div className="nav-actions">
            <a
              className="language-link"
              href={content.language.href}
              hrefLang={content.language.hrefLang}
              lang={content.language.hrefLang}
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
                {content.interface.title[0]}
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

        <section id="apps" className="story story-app page-shell">
          <div className="story-heading">
            <div className="story-index">
              <span>02</span>
              <span>APP SUPPORT</span>
            </div>
            <div className="story-title">
              <h2>
                {content.apps.title[0]}
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

        <section id="vibe" className="story story-vibe">
          <div className="page-shell">
            <div className="story-heading story-heading-dark">
              <div className="story-index">
                <span>03</span>
                <span>VIBE APP</span>
              </div>
              <div className="story-title">
                <h2>
                  {content.vibe.title[0]}
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
                  loading="eager"
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
                  loading="eager"
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
      </main>

      <footer className="site-footer page-shell">
        <a className="brand" href="#interface" aria-label={content.aria.backToTop}>
          <Image src="/brand/mark.svg" alt="" width={25} height={25} />
          <span>DeepDeck</span>
        </a>
        <p>Built on DeepSeek Harness. Composed with Cordis.</p>
        <div className="footer-links">
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${githubUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>
        </div>
      </footer>
    </>
  );
}
