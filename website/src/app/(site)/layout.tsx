import type { ReactNode } from 'react';

import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';

/**
 * The MARKETING shell — the site's default: full nav on top, sitemap footer
 * at the bottom, pages read top to bottom in between. Every page that is
 * copy rather than product belongs here.
 *
 * The shell is stated here, whole, rather than inherited from the root, so
 * that a sibling shell can differ: `(app)` drops the footer, and a lead-gen
 * variant can swap this header for a stripped one without touching a page.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
