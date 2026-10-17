'use client';

import { useDocsIntegration } from '@embedpdf/docs-kit';
import type { ReactNode } from 'react';

import type { DocsIntegration } from '@/lib/docs-integrations';

/** Renders children only on the given integrations' pages. The pathname says
 * which (docs/conventions/docs-architecture.md): /docs/headless/<fw>/… or
 * /docs/viewer/<integration>/…, `vanilla` included on a viewer page. Rare by
 * design — prose should be framework-neutral; heavy use means the page belongs
 * in the explicit per-framework fork set (install/SSR). */
export function Fw({
  only,
  children,
}: {
  only: DocsIntegration | DocsIntegration[];
  children: ReactNode;
}) {
  const integration = useDocsIntegration();
  const list = Array.isArray(only) ? only : [only];
  if (!list.includes(integration)) return null;
  return <>{children}</>;
}
