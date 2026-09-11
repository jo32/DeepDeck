import { WebMCPDirectory as Directory } from '../../../../plugins/browser/src/client/WebMCPDirectory'
import styles from './webmcp-submission.module.css'

export function WebMCPDirectory({ catalog, locale, source }: { catalog: unknown; locale: 'en' | 'zh'; source: 'live' | 'bundled' }) {
  const zh = locale === 'zh'
  return <>
    {source === 'bundled' && <p className={styles.notice} role="status">{zh ? '实时目录暂不可用，正在显示随版本附带的目录。' : 'Live directory unavailable. Showing the bundled directory.'}</p>}
    <Directory catalog={catalog} locale={locale} submissionHref="#submit" />
    <section id="submit" className={styles.submission} aria-labelledby="submission-title">
      <h2 id="submission-title">{zh ? '从 DeepDeck 发布 WebMCP' : 'Publish a WebMCP from DeepDeck'}</h2>
      <p>{zh ? '在对应网站的 Site Agent 中选择「发布」，或让 Agent 发布并上架这个项目。Agent 会提交已发布版本的清单和源码，校验通过后立即出现在目录中。' : 'Choose Publish in the website’s Site Agent, or ask your Agent to publish and list the project. The Agent submits the published manifest and source, and the project appears here as soon as validation succeeds.'}</p>
      <p>{zh ? '之后发布新版本时，Agent 会自动更新目录。浏览和收录直接使用目录服务，无需等待 GitHub 扫描。安装前，DeepDeck 会展示并核验对应版本的仓库源码。' : 'When you publish another version, the Agent updates the listing automatically. Browsing and indexing use the directory service directly, without waiting for a GitHub scan. Before installation, DeepDeck previews and verifies the source for that exact version.'}</p>
    </section>
  </>
}
