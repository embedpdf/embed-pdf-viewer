import { AngularIcon, JsMark, ReactIcon, SvelteIcon, VueIcon } from '@embedpdf/docs-kit';

import type { DocsIntegration } from '@/lib/docs-integrations';

/**
 * One mark per integration, shared by the docs landing, the marketing plan
 * section, and the sidebar switcher — so adding a framework to
 * `DOCS_INTEGRATIONS` lights it up everywhere instead of in one card.
 *
 * The JS mark ships two fixed sizes rather than a free scale; it snaps to the
 * nearest one.
 */
export function IntegrationLogo({
  integration,
  size = 18,
}: {
  integration: DocsIntegration;
  size?: number;
}) {
  switch (integration) {
    case 'vanilla':
      return <JsMark small={size < 20} />;
    case 'react':
      return <ReactIcon size={size} />;
    case 'vue':
      return <VueIcon size={size} />;
    case 'svelte':
      return <SvelteIcon size={size} />;
    case 'angular':
      return <AngularIcon size={size} />;
  }
}
