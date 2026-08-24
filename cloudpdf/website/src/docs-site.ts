import type { DocsSiteBinding } from '@embedpdf/docs-kit';

/**
 * This site's axis binding (DOCS-PLATFORM-ARCHITECTURE.md): cloudpdf.com
 * documents the CLOUD engine. `next.config.ts` compiles `<Engine>` blocks
 * with it; the sidebar filters `engines:` frontmatter with it.
 */
export const DOCS_SITE = {
  site: 'cloudpdf',
  engine: 'cloud',
} as const satisfies DocsSiteBinding;
