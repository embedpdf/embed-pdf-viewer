import { getPageMap } from 'nextra/page-map';
import type { ReactNode } from 'react';

import { ConfigProvider } from '@/components/docs/config-provider';
import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';

/**
 * The DOCS shell — marketing chrome around the sidebar/content container.
 * Header and Footer stay OUTSIDE ConfigProvider: that provider is not just
 * context, it renders the max-width flex row holding the sidebar and <main>,
 * so anything passed as its child lands inside the content column.
 */
export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap();

  return (
    <>
      <Header />
      <ConfigProvider pageMap={pageMap}>{children}</ConfigProvider>
      <Footer />
    </>
  );
}
