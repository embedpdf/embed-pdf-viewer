import type { DocsSiteBinding } from '@embedpdf/docs-kit';

/**
 * This site's axis binding (DOCS-PLATFORM-ARCHITECTURE.md): embedpdf.com
 * documents the LOCAL engine. `next.config.ts` compiles `<Engine>` blocks
 * with it; the sidebar filters `engines:` frontmatter with it.
 */
export const DOCS_SITE = {
  site: 'embedpdf',
  engine: 'local',
} as const satisfies DocsSiteBinding;
