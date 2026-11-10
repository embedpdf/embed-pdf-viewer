import type { MetadataRoute } from 'next';

import { SITE_ORIGIN } from '@/lib/site';

/**
 * Every crawler may read every page, and the sitemap lists them. Nothing is closed off: the
 * social images that pages name are under `/api/og`, and the crawlers that fetch them obey this
 * file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
