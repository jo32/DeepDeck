import { notFound } from 'next/navigation';
import { BlogArticle } from '../../../../_components/blog-page';
import { blogMetadata, blogPosts, getBlogPost } from '../../../../../lib/blog';

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return blogPosts.map(post => ({ slug: post.slug })); }
export async function generateMetadata({ params }: Props) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();
  return blogMetadata('zh', post);
}
export default async function Page({ params }: Props) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();
  return <BlogArticle locale="zh" post={post} />;
}
