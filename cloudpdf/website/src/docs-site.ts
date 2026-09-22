import type { DocsSiteBinding } from '@embedpdf/docs-kit';

/**
 * This site's axis binding (docs/conventions/docs-architecture.md): cloudpdf.com
 * documents the cloud engine. `next.config.ts` compiles `<Engine>` blocks
 * with it; the sidebar filters `engines:` frontmatter with it.
 */
export const DOCS_SITE = {
  site: 'cloudpdf',
  engine: 'cloud',
} as const satisfies DocsSiteBinding;
