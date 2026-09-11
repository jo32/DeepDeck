'use client'

import { useMemo, useState } from 'react'
import { parseCatalog, WEBMCP_REGISTRY_URL } from '../webmcp-package.ts'
import { useDeepDeckMarket } from './use-deepdeck-market.ts'
import { marketInstallLink, type MarketPackageRef } from '../market-link.ts'
import styles from './webmcp-directory.module.css'

type IconName = 'search' | 'arrow' | 'plus' | 'box' | 'grid' | 'branch' | 'globe' | 'check' | 'code' | 'book'
function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    plus: <path d="M12 5v14M5 12h14" />,
    box: <><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 5 9-5M7.5 5.5l9 5" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M6 7v10M18 7v2c0 4-12 2-12 6" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" /></>,
    book: <><path d="M5 3h14v18H6a3 3 0 0 1 0-6h13M5 3v12M9 7h6M9 10h4" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function WebMCPDirectory({ catalog: raw, locale, onInstall }: { catalog: unknown; locale: 'en' | 'zh'; onInstall?: ((ref: MarketPackageRef) => void) | undefined }) {
  const catalog = useMemo(() => parseCatalog(raw), [raw])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [filter, setFilter] = useState<'all' | 'stable' | 'preview'>('all')
  const [tag, setTag] = useState('')
  const [selected, setSelected] = useState<string>()
  const [copied, setCopied] = useState('')
  const [copyError, setCopyError] = useState('')
  const zh = locale === 'zh'
  const bridge = useDeepDeckMarket()
  const market = { embedded: !!onInstall || bridge.embedded, install: onInstall ?? bridge.install }
  const tokens = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean)
  const tags = [...new Set(catalog.entries.flatMap(entry => entry.tags))].sort()
  const entries = catalog.entries.filter(entry => (filter === 'all' || (filter === 'stable' ? !!entry.version : !entry.version)) && (!tag || entry.tags.includes(tag)) && tokens.every(token => `${entry.name} ${entry.origin} ${entry.description} ${entry.tags.join(' ')} ${entry.repository}`.toLocaleLowerCase().includes(token)))
    .sort((a, b) => sort === 'updated' ? (b.syncedAt ?? '').localeCompare(a.syncedAt ?? '') : a.name.localeCompare(b.name))
  const filters = [
    { id: 'all' as const, icon: 'grid' as const, label: zh ? '全部项目' : 'All projects', count: catalog.entries.length },
    { id: 'stable' as const, icon: 'check' as const, label: zh ? '稳定版本' : 'Stable releases', count: catalog.entries.filter(entry => entry.version).length },
    { id: 'preview' as const, icon: 'code' as const, label: zh ? '开发预览' : 'Development', count: catalog.entries.filter(entry => !entry.version).length },
  ]
  const filtered = !!query || filter !== 'all' || !!tag
  return <main className={`${styles.directory} ${market.embedded ? styles.embedded : ''}`}>
    <nav className={styles.navigation} aria-label={zh ? '市场导航' : 'Marketplace navigation'}>
      <div className={styles.navInner}>
        <div className={styles.breadcrumb}><a className={styles.brand} href={zh ? '/zh' : '/'}><span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>DeepDeck</a><span className={styles.slash}>/</span><span className={styles.breadcrumbName}>Marketplace</span></div>
        <div className={styles.navLinks}><a href={zh ? '/webmcp' : '/zh/webmcp'}><Icon name="globe" />{zh ? 'EN' : '中文'}</a><a className={styles.navGithub} href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer">GitHub<Icon name="arrow" /></a><a className={styles.primary} href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer"><Icon name="plus" />{zh ? '提交项目' : 'Submit project'}</a></div>
      </div>
    </nav>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div><div className={styles.eyebrow}><span />COMMUNITY / WEBMCP</div><h1>{zh ? '网站工具，共同构建。' : 'Website tools. Built together.'}</h1><p>{zh ? '发现、使用和改进 WebMCP。每个工具，都有一个可以共同维护的 GitHub 项目。' : 'Discover, use, and improve WebMCP. Open-source tools, maintained together on GitHub.'}</p></div>
        <a className={styles.docsLink} href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer"><Icon name="book" />{zh ? '贡献指南' : 'Contribution guide'}<Icon name="arrow" /></a>
      </header>
      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label={zh ? '筛选项目' : 'Filter projects'}>
          <p className={styles.sectionLabel}>{zh ? '浏览' : 'Browse'}</p>
          <div className={styles.filters}>{filters.map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id) }}><Icon name={item.icon} /><span>{item.label}</span><span className={styles.filterCount}>{item.count}</span></button>)}</div>
          {tags.length > 0 && <div className={styles.tagFilters}><p className={styles.sectionLabel}>{zh ? '能力标签' : 'Capabilities'}</p>{tags.map(value => <button key={value} aria-pressed={tag === value} onClick={() => { setTag(tag === value ? '' : value) }}>{value}</button>)}</div>}
          <div className={styles.sidebarNote}><Icon name="branch" /><strong>{zh ? '在 GitHub，一起维护。' : 'Better, together.'}</strong><p>{zh ? '遇到过时的工具？向上游提交 Issue 或贡献修复。' : 'Found an outdated tool? Open an issue or contribute a fix upstream.'}</p><a href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer">{zh ? '了解协作方式' : 'How to contribute'}<Icon name="arrow" size={14} /></a></div>
        </aside>
        <section className={styles.results} aria-label={zh ? 'WebMCP 项目' : 'WebMCP projects'}>
          <div className={styles.toolbar}><div className={styles.search}><Icon name="search" size={18} /><input aria-label={zh ? '搜索网站、任务或项目' : 'Search websites, tasks or projects'} type="search" value={query} onChange={event => { setQuery(event.target.value) }} placeholder={zh ? '搜索网站、任务或项目…' : 'Search websites, tasks, or projects…'} /></div><select aria-label={zh ? '排序' : 'Sort'} value={sort} onChange={event => { setSort(event.target.value) }}><option value="name">{zh ? '按名称排序' : 'Sort by name'}</option><option value="updated">{zh ? '最近同步' : 'Recently synced'}</option></select></div>
          <div className={styles.resultHeading}><span aria-live="polite">{filters.find(item => item.id === filter)?.label}<span className={styles.count}>{entries.length}</span>{tag && <button className={styles.tagClear} onClick={() => { setTag('') }}>{tag} ×</button>}</span><span className={styles.resultMeta}><Icon name="branch" size={13} />{zh ? '源码托管于 GitHub' : 'Source on GitHub'}</span></div>
          {entries.length === 0 && <section className={styles.empty}>
            <div className={styles.emptyArt} aria-hidden="true"><div className={styles.artGrid} /><div className={styles.artSide}><Icon name="code" size={21} /></div><div className={styles.artBox}><Icon name={filtered ? 'search' : 'box'} size={34} /></div><div className={styles.artSide}><Icon name="branch" size={21} /></div></div>
            <h2>{filtered ? (zh ? '没有找到匹配的项目' : 'No matching projects') : (zh ? '第一个项目，从你开始。' : 'The first project starts with you.')}</h2>
            <p>{filtered ? (zh ? '试试其他关键词，或清除筛选条件。' : 'Try another search or clear your filters.') : (zh ? '把你构建的 WebMCP 分享出来，\n让下一个访问这个网站的人也能用上。' : 'Share the WebMCP you built.\nMake it useful for the next person, too.')}</p>
            {filtered ? <button className={styles.secondary} onClick={() => { setQuery(''); setFilter('all'); setTag('') }}>{zh ? '清除筛选' : 'Clear filters'}</button> : <a className={styles.primary} href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer"><Icon name="plus" />{zh ? '发布第一个 WebMCP' : 'Publish your WebMCP'}</a>}
            {!filtered && <a className={styles.emptyLink} href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer">{zh ? '查看收录要求' : 'View submission requirements'}<Icon name="arrow" size={13} /></a>}
          </section>}
          <div className={styles.grid}>{entries.map(entry => <article key={entry.id}>
            <div className={styles.cardTop}><div className={styles.projectIcon}><Icon name="box" size={21} /></div><small>{entry.status === 'archived' ? (zh ? '已归档' : 'Archived') : entry.status === 'unavailable' ? (zh ? '暂不可用' : 'Unavailable') : entry.version ?? (zh ? '开发预览' : 'Development')}</small></div>
            <h2>{entry.name}</h2>{entry.author && <a className={styles.author} href={entry.author.url} target="_blank" rel="noreferrer"><img src={entry.author.avatarUrl} alt="" width={20} height={20} loading="lazy" referrerPolicy="no-referrer" />@{entry.author.login}</a>}<a className={styles.origin} href={entry.origin} target="_blank" rel="noreferrer"><Icon name="globe" size={13} />{new URL(entry.origin).hostname}<Icon name="arrow" size={12} /></a><p className={styles.description}>{entry.description}</p><div className={styles.tags}>{entry.tags.map(value => <button key={value} onClick={() => { setTag(value) }}>{value}</button>)}</div>
            {entry.syncError && <p className={styles.warning}>{zh ? '同步暂不可用，请查看上游最新状态。' : 'Sync unavailable. Check upstream for the latest status.'}</p>}
            <div className={styles.installAction}>{entry.status !== 'active' ? <button className={styles.secondary} disabled>{zh ? '暂不可安装' : 'Unavailable'}</button> : market.embedded ? <button className={styles.primary} onClick={() => { market.install({ repository: entry.repository, manifestPath: entry.manifestPath, repositoryId: entry.repositoryId, ...(!entry.version && entry.commit ? { commit: entry.commit } : {}) }) }}>{zh ? '安装' : 'Install'}</button> : <a className={styles.primary} href={marketInstallLink({ repository: entry.repository, manifestPath: entry.manifestPath, repositoryId: entry.repositoryId, ...(!entry.version && entry.commit ? { commit: entry.commit } : {}) })} onClick={() => { setSelected(entry.id) }}>{zh ? '在 DeepDeck 中安装' : 'Install in DeepDeck'}<Icon name="arrow" size={13} /></a>}</div>
            <div className={styles.cardLinks}><a href={entry.repository} target="_blank" rel="noreferrer"><Icon name="branch" />GitHub</a><a href={`${entry.repository}/issues`} target="_blank" rel="noreferrer">{zh ? '问题与修复' : 'Issues & fixes'}</a><button aria-label={zh ? '在 DeepDeck 中使用' : 'Use in DeepDeck'} aria-expanded={selected === entry.id} onClick={() => { setSelected(selected === entry.id ? undefined : entry.id); setCopyError('') }}>{zh ? '在 DeepDeck 中使用' : 'Use in DeepDeck'}<span aria-hidden="true">{selected === entry.id ? '−' : '+'}</span></button></div>
            {selected === entry.id && <div className={styles.install}><p>{zh ? '在 DeepDeck 打开目标网站 → WebMCP → 社区，粘贴仓库地址并预览。' : 'Open the target website in DeepDeck → WebMCP → Community. Paste this repository and preview.'}</p>{!market.embedded && <p>{zh ? '没有唤起应用？' : 'App did not open?'} <a href={zh ? '/zh#install' : '/#install'}>{zh ? '下载或更新 DeepDeck' : 'Download or update DeepDeck'}</a></p>}<code>{entry.repository}</code><p>{zh ? '清单路径' : 'Manifest path'}: <code>{entry.manifestPath}</code></p><div><button onClick={() => { void navigator.clipboard.writeText(entry.repository).then(() => { setCopied(entry.id); setCopyError('') }, () => { setCopyError(zh ? '复制失败，请手动复制上方地址。' : 'Could not copy. Select the URL above to copy it manually.') }) }}>{copied === entry.id ? (zh ? '已复制' : 'Copied') : (zh ? '复制仓库地址' : 'Copy repository URL')}</button><a href={`${entry.repository}/releases`} target="_blank" rel="noreferrer">{zh ? '版本历史' : 'Releases'}<Icon name="arrow" size={13} /></a></div>{copyError && <p role="status">{copyError}</p>}</div>}
          </article>)}</div>
          <div className={styles.guide}><a href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer"><Icon name="code" size={18} /><div><strong>{zh ? '构建并发布' : 'Build & publish'}</strong><p>{zh ? '把网站能力变成可复用工具' : 'Turn site capabilities into reusable tools'}</p></div><Icon name="arrow" size={14} /></a><a href={WEBMCP_REGISTRY_URL} target="_blank" rel="noreferrer"><Icon name="branch" size={18} /><div><strong>{zh ? '贡献一份修复' : 'Contribute a fix'}</strong><p>{zh ? '让好用的工具持续可用' : 'Keep useful tools working'}</p></div><Icon name="arrow" size={14} /></a></div>
        </section>
      </div>
      <footer className={styles.footer}><div><span className={styles.footerDot} />{zh ? '开放源码 · 共同维护' : 'Open source. Shared maintenance.'}</div><p>{zh ? '收录不代表功能验证，使用前请查看上游记录。' : 'A listing is not functional verification. Check upstream before use.'}</p><span className={styles.sync}>{catalog.generatedAt ? `${zh ? '同步' : 'Synced'} ${catalog.generatedAt.slice(0, 10)}` : (zh ? '等待首次同步' : 'Awaiting first sync')}</span></footer>
    </div>
  </main>
}
