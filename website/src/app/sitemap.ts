import type { MetadataRoute } from 'next';

import { TOOLS } from '@/components/tools/content';
import { examplePages } from '@/lib/example-pages';
import { examplePageHref } from '@/lib/examples';
import { SITE_ORIGIN } from '@/lib/site';

/**
 * The site's pages for search engines. The docs aren't listed yet: which of their framework
 * variants are live is decided per page by the publish gate.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const examples = (await examplePages()).filter((page) => page.demo);
  const paths = [
    '/',
    '/demo',
    '/examples',
    ...examples.map((page) => examplePageHref(page.slug)),
    '/react-pdf-viewer',
    '/vue-pdf-viewer',
    '/svelte-pdf-viewer',
    '/angular-pdf-viewer',
    '/sponsorship',
    '/sponsors',
    '/tools',
    ...TOOLS.map((tool) => tool.href),
  ];
  return paths.map((path) => ({ url: `${SITE_ORIGIN}${path === '/' ? '' : path}` }));
}
