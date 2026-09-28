import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import s from './blog.module.css';

export function BlogMarkdown({ children }: { children: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={{
    table: ({ children }) => <div className={s.tableScroll} tabIndex={0}><table className={s.articleTable}>{children}</table></div>,
    th: ({ children }) => <th scope="col">{children}</th>,
  }}>{children}</Markdown>;
}
