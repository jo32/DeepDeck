import Image from 'next/image';
import type { ReactNode } from 'react';
import { blogDate, blogPath, blogPosts, blogStructuredData } from '../../lib/blog';
import type { BlogPost } from '../../lib/blog-types';
import type { SiteLocale } from '../../lib/locale';
import results from '../../public/research/benchmarks/webmcp-reference-retest-2026-09-23.json';
import s from './blog.module.css';

function BlogShell({ locale, slug, children }: { locale: SiteLocale; slug?: string; children: ReactNode }) {
  const zh = locale === 'zh';
  return <div className={s.page}>
    <a href="#blog-content" className={s.skip}>{zh ? '跳转到正文' : 'Skip to content'}</a>
    <header className={s.header}><div className={s.headerInner}>
      <a className={s.brand} href={zh ? '/zh' : '/'} aria-label={zh ? 'DeepDeck 首页' : 'DeepDeck home'}><Image src="/brand/mark.svg" width={28} height={28} alt="" /><span>DeepDeck</span></a>
      <nav aria-label={zh ? '主导航' : 'Main navigation'}>
        <a href={zh ? '/zh/benchmarks' : '/benchmarks'}>Bench</a>
        <a href={blogPath(locale)} aria-current={slug ? undefined : 'page'}>{zh ? '博客' : 'Blog'}</a>
        <a href={blogPath(zh ? 'en' : 'zh', slug)} hrefLang={zh ? 'en' : 'zh-CN'} aria-label={zh ? 'Read in English' : '阅读中文版'} className={s.language}>{zh ? 'EN' : '中文'}</a>
      </nav>
    </div></header>
    {children}
    <footer className={`${s.footer} ${s.shell}`}><a className={s.brand} href={zh ? '/zh' : '/'}>DeepDeck</a><p>{zh ? '记录实际做过的事。' : 'Notes from building and testing.'}</p><a href="https://github.com/jo32/DeepDeck">GitHub ↗</a></footer>
  </div>;
}

export function BlogIndex({ locale }: { locale: SiteLocale }) {
  const zh = locale === 'zh';
  return <BlogShell locale={locale}><main id="blog-content" className={s.shell}>
    <section className={s.indexIntro}><p className={s.eyebrow}>DEEPDECK / FIELD NOTES</p><h1>{zh ? '开发、实验，' : 'Build. Test.'}<br /><span>{zh ? '和下一次改进。' : 'Keep learning.'}</span></h1><p className={s.lead}>{zh ? '写下 Agent 是怎样做出来、测出来、再改好的。也记录那些没有变好的地方。' : 'How we build, evaluate, and improve agents. Including the things that did not get better.'}</p></section>
    <section className={s.posts} aria-labelledby="posts-title"><div className={s.listHeading}><h2 id="posts-title">{zh ? '最新文章' : 'Latest writing'}</h2><span>{String(blogPosts.length).padStart(2, '0')}</span></div>
      {blogPosts.map(post => { const content = post.translations[locale]; return <article key={post.slug} className={s.card}>
        <a href={blogPath(locale, post.slug)} className={s.coverLink} aria-label={content.title}><Image src="/blog/benchmark-iteration.svg" alt={zh ? '评测、读记录、改接口、再复测的迭代过程' : 'Benchmark, inspect traces, improve the interface, retest'} width={1200} height={630} className={s.cover} priority /></a>
        <div className={s.cardBody}><p className={s.eyebrow}>{content.category}</p><h3><a href={blogPath(locale, post.slug)}>{content.title}</a></h3><p>{content.description}</p><div className={s.meta}><time dateTime={post.date}>{blogDate(post.date, locale)}</time><span>{post.author}</span></div><a className={s.readLink} href={blogPath(locale, post.slug)}>{zh ? '阅读全文' : 'Read the story'} <span aria-hidden="true">↗</span></a></div>
      </article>; })}
    </section>
  </main></BlogShell>;
}

function ToolReferenceFigure({ locale }: { locale: SiteLocale }) {
  const zh = locale === 'zh';
  return <figure className={s.toolFigure}>
    <p className={s.toolTask}>{zh ? '同一个任务：用订单号和邮箱查询订单状态' : 'Same task: look up an order using its reference and email'}</p>
    <div className={s.toolCards}>
      <div>
        <h3>{zh ? '以前：模型填写所有信息' : 'Before: the model supplies every field'}</h3>
        <ul>
          <li>{zh ? '要用什么工具：查询订单' : 'Which tool: order lookup'}</li>
          <li>{zh ? '要查什么：订单号、邮箱' : 'What to look up: order reference and email'}</li>
          <li>{zh ? '工具在哪里：页面编号、页面内区域编号' : 'Where the tool is: document and frame identifiers'}</li>
          <li>{zh ? '工具是什么版本：版本编号（如有）' : 'Which version: the tool revision, if present'}</li>
        </ul>
        <p className={s.toolOutcome}>{zh ? '即使选对了工具，页面或版本编号填错，调用也会被拒绝。模型需要重新查看工具清单，再试一次。' : 'Even with the right tool selected, a wrong document or version identifier causes rejection. The model must rediscover the tool and try again.'}</p>
      </div>
      <div className={s.newTool}>
        <h3>{zh ? '现在：模型少填定位信息' : 'After: DeepDeck supplies the identifiers'}</h3>
        <ul>
          <li>{zh ? '要用什么工具：从清单选“查询订单”，使用它的工具编号' : 'Which tool: select order lookup and use its tool reference'}</li>
          <li>{zh ? '要查什么：仍然填写订单号、邮箱' : 'What to look up: still supply the order reference and email'}</li>
        </ul>
        <p className={s.toolOutcome}>{zh ? 'DeepDeck 根据工具编号取出已保存的页面、区域和版本信息，检查是否有效，再执行调用。模型不用再抄这些字段。' : 'DeepDeck retrieves the saved document, frame, and revision from that reference, validates them, and dispatches the call. The model no longer copies those fields.'}</p>
      </div>
    </div>
    <figcaption>{zh ? '工具编号就是 toolRef，由 DeepDeck 在列出工具时生成，模型从清单中取用。它解决的是定位信息填写错误；模型仍然可能选错工具，或填错订单号。' : 'The tool reference is toolRef, generated by DeepDeck during discovery and returned in the tool list. It reduces identifier-entry errors; the model can still select the wrong tool or supply the wrong order reference.'}</figcaption>
  </figure>;
}

function RetestFigure({ locale }: { locale: SiteLocale }) {
  const zh = locale === 'zh';
  const models = [results.models.mimo, results.models.luna];
  const cell = (m: typeof models[number], metric: 'seconds' | 'steps' | 'costUSD') => {
    const value = (arm: 'old' | 'new') => { const n = m.summary[arm].meanSixTaskSuite[metric]; return metric === 'costUSD' ? `$${n.toFixed(5)}` : metric === 'seconds' ? `${(n / 60).toFixed(2)}` : `${Number(n.toFixed(1))}`; };
    return `${value('old')} → ${value('new')}`;
  };
  return <figure className={s.resultFigure}>
    <div className={s.tableScroll} role="region" aria-label={zh ? '新旧版本复测数据，可横向滚动' : 'Before and after data; scroll horizontally'} tabIndex={0}><table><caption>{zh ? '6 道题 · 旧版一次 → 新版三次均值' : 'Six tasks · one old run → mean of three new runs'}</caption><thead><tr><th scope="col">{zh ? '指标' : 'Metric'}</th><th scope="col">MiMo V2.6 Flash</th><th scope="col">GPT-5.6 Luna</th></tr></thead><tbody>
      <tr><th scope="row">{zh ? 'WebMCP 调用错误率' : 'WebMCP call error rate'}</th>{models.map((m, i) => <td key={i}>{(['old', 'new'] as const).map(arm => `${(m.summary[arm].webmcpErrors / m.summary[arm].webmcpCalls * 100).toFixed(1)}%`).join(' → ')}</td>)}</tr>
      {([['seconds', zh ? '整组耗时（分钟）' : 'Suite time (minutes)'], ['steps', zh ? '整组执行轮次' : 'Suite agent steps'], ['costUSD', zh ? '整组估算费用（USD）' : 'Suite estimated cost (USD)']] as const).map(([metric, label]) => <tr key={metric}><th scope="row">{label}</th>{models.map((m, i) => <td key={i}>{cell(m, metric)}</td>)}</tr>)}
    </tbody></table></div>
    <figcaption>{zh ? 'WebMCP ON；费用计入实际缓存折扣。错误率按全部调用计算。历史对照，非同期随机 A/B，不代表全题库表现。' : 'WebMCP ON; actual cached-token pricing included. Error rates use all calls. Historical comparison, not a randomized A/B or a full-suite result.'}</figcaption>
  </figure>;
}

export function BlogArticle({ locale, post }: { locale: SiteLocale; post: BlogPost }) {
  const zh = locale === 'zh';
  const content = post.translations[locale];
  return <BlogShell locale={locale} slug={post.slug}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blogStructuredData(post, locale) }} />
    <main id="blog-content" className={s.shell}>
      <header className={s.articleHeader}><a className={s.back} href={blogPath(locale)}>← {zh ? '所有文章' : 'All posts'}</a><p className={s.eyebrow}>{content.category}</p><h1>{content.title}</h1><p className={s.lead}>{content.description}</p><div className={s.meta}><span>{post.author}</span><time dateTime={post.date}>{blogDate(post.date, locale)}</time><a href="#sources">{zh ? '代码与数据 ↗' : 'Code & data ↗'}</a></div></header>
      <div className={s.articleLayout}>
        <aside className={s.toc}><details open><summary>{zh ? '文章目录' : 'In this article'}</summary><nav aria-label={zh ? '文章目录' : 'Article contents'}><ol>{content.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol></nav></details></aside>
        <article className={s.prose} aria-label={content.title}>
          <Image src="/blog/benchmark-iteration.svg" width={1200} height={630} alt={zh ? '从评测到读记录、改接口，再回到复测' : 'From benchmarks to traces, interface changes, and a retest'} className={s.articleCover} priority />
          <div className={s.introduction}>{content.introduction.map(p => <p key={p}>{p}</p>)}</div>
          {content.sections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2>{section.paragraphs.map((p, i) => <div key={p}><p>{p}</p>{i === 0 && section.figure === 'tool-reference' && <ToolReferenceFigure locale={locale} />}{i === 0 && section.figure === 'retest' && <RetestFigure locale={locale} />}</div>)}{section.points && <ol className={s.steps}>{section.points.map(point => <li key={point}>{point}</li>)}</ol>}</section>)}
          <section id="sources" className={s.sources}><p className={s.eyebrow}>OPEN RECORD</p><h2>{zh ? '代码、数据与实验记录' : 'Code, data, and experiment records'}</h2><ul>{post.sources.map(source => <li key={source.href}><a href={source.href}>{source.label[locale]} ↗</a></li>)}</ul><a className={s.readLink} href={zh ? '/zh/benchmarks#results' : '/benchmarks#results'}>{zh ? '查看 DeepDeck Bench 完整评测' : 'Explore the full DeepDeck Bench evaluation'} ↗</a></section>
        </article>
      </div>
    </main>
  </BlogShell>;
}
