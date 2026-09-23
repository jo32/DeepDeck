import type { SiteLocale } from './locale';

export interface BlogSection {
  id: string;
  title: string;
  paragraphs: string[];
  points?: string[];
  figure?: 'tool-reference' | 'retest';
}

export interface BlogTranslation {
  title: string;
  description: string;
  category: string;
  introduction: string[];
  sections: BlogSection[];
}

export interface BlogPost {
  slug: string;
  date: string;
  author: string;
  translations: Record<SiteLocale, BlogTranslation>;
  sources: { href: string; label: Record<SiteLocale, string> }[];
}
