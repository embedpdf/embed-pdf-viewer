import type { ReactNode } from 'react';

import { Header } from '@/components/site/header';

/**
 * The APP shell — pages where the viewer IS the page: the live demo today,
 * lead-gen landing pages with a purpose-built toolbar next. Same nav as the
 * marketing shell, and then deliberately nothing: no footer, nothing below
 * the fold, so the page ends where the viewport does and the product reads
 * as an app rather than as an embed on a brochure.
 *
 * Shared chrome for these pages (a CTA rail, a "get this viewer" bar) lands
 * here later. Simplifying a page's TOOLBAR is not a layout concern — that's
 * the viewer's own `chrome` value, per page.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
