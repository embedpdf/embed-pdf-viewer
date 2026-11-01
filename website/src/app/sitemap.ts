import type { MetadataRoute } from 'next';

import { TOOLS } from '@/components/tools/content';
import { SITE_ORIGIN } from '@/lib/site';

/**
 * The site's pages for search engines. The docs aren't listed yet: which of their framework
 * variants are live is decided per page by the publish gate.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '/',
    '/demo',
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
