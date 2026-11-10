import path from 'node:path';

import { listDocsPages } from '@embedpdf/docs-kit/llms';

import { PRODUCT_INTEGRATIONS, type DocsIntegration } from './docs-integrations';
import { docsRelease } from './docs-release';
import { urlForSection } from './search-site';

/**
 * The docs pages for search engines: each page for each integration it is written for, where the
 * publish gate has it live. A page that is held back says `noindex`, so it isn't listed either.
 * The pages come in the sidebar's order.
 */
export function docsSitemapPaths(): string[] {
  return listDocsPages(path.join(process.cwd(), 'src', 'content')).flatMap(({ contentPath }) => {
    const product = contentPath.split('/')[1];
    const integrations: readonly (DocsIntegration | null)[] =
      product === 'viewer' || product === 'headless' ? PRODUCT_INTEGRATIONS[product] : [null];
    return integrations
      .filter((integration) => docsRelease(contentPath.split('/'), integration ?? undefined).live)
      .map((integration) => urlForSection(contentPath, null, integration));
  });
}
