import type { MetadataRoute } from 'next';

import { docsSitemapPaths } from '@/lib/docs-sitemap';
import { examplePages } from '@/lib/example-pages';
import { examplePageHref } from '@/lib/examples';
import { SITE_ORIGIN } from '@/lib/site';

/**
 * The site's pages for search engines: its own pages, then the docs, each docs page for every
 * integration it is live for (`@/lib/docs-sitemap`).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const examples = (await examplePages()).filter((page) => page.demo);
  const paths = [
    '/',
    '/pricing',
    '/examples',
    ...examples.map((page) => examplePageHref(page.slug)),
    '/contact',
    '/terms',
    '/privacy',
    '/refund-policy',
    ...docsSitemapPaths(),
  ];
  return paths.map((path) => ({ url: `${SITE_ORIGIN}${path === '/' ? '' : path}` }));
}
