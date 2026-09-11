import type { GitHubAuthor as Author } from '../webmcp-package.js'
import css from './community.module.css'

export function GitHubAuthor({ author }: { author?: Author | undefined }) {
  if (!author) return null
  return <a className={css.author} href={author.url} target="_blank" rel="noreferrer">
    <img src={author.avatarUrl} alt="" width={24} height={24} loading="lazy" referrerPolicy="no-referrer" />
    <span>@{author.login}</span>
  </a>
}
