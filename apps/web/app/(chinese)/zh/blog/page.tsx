import { BlogIndex } from '../../../_components/blog-page';
import { blogMetadata } from '../../../../lib/blog';
export const metadata = blogMetadata('zh');
export default function Page() { return <BlogIndex locale="zh" />; }
