import path from 'node:path';

import { createDocsSearchRoute } from '@embedpdf/docs-kit/search';

import { INTEGRATION_COOKIE, isDocsIntegration } from '@/lib/docs-integrations';
import { urlForSection } from '@/lib/search-site';

export const dynamic = 'force-dynamic';

/**
 * Search over this deployment's own `search-index.bin` (built by
 * `pnpm search:index` from the same content this deployment renders,
 * API reference included) — no database anywhere. `next.config` traces
 * the artifact into the function's filesystem.
 */
export const { GET } = createDocsSearchRoute({
  artifactPath: path.join(process.cwd(), 'public', 'search-index.bin'),
  urlForSection,
  isIntegration: (value) => isDocsIntegration(value),
  integrationCookie: INTEGRATION_COOKIE,
});
