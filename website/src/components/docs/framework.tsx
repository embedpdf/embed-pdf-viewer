'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  DEFAULT_PRODUCT_INTEGRATION,
  headlessIntegrationFromPath,
  type HeadlessIntegration,
} from '@/lib/docs-integrations';

/**
 * The pathname is the single source of truth for the active framework
 * (DOCS-ARCHITECTURE.md pillar 2): /docs/headless/<fw>/… — no provider
 * threading, correct during SSR, and every component derives it the same way.
 */
export function useFramework(): HeadlessIntegration {
  const pathname = usePathname();
  return headlessIntegrationFromPath(pathname) ?? DEFAULT_PRODUCT_INTEGRATION.headless;
}

/** Renders children only on the given frameworks' pages. Rare by design —
 * prose should be framework-neutral; heavy use means the page belongs in the
 * explicit per-framework fork set (install/SSR). */
export function Fw({
  only,
  children,
}: {
  only: HeadlessIntegration | HeadlessIntegration[];
  children: ReactNode;
}) {
  const fw = useFramework();
  const list = Array.isArray(only) ? only : [only];
  if (!list.includes(fw)) return null;
  return <>{children}</>;
}
