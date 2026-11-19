import { sidebarPageMap } from '@embedpdf/docs-kit';
import { getPageMap } from 'nextra/page-map';
import type { ReactNode } from 'react';

import { ConfigProvider } from '@/components/docs/config-provider';

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pageMap = sidebarPageMap(await getPageMap());

  return <ConfigProvider pageMap={pageMap}>{children}</ConfigProvider>;
}
