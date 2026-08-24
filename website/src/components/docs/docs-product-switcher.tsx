'use client';

import {
  BoltBadgeIcon,
  DocsProductSwitcher as KitSwitcher,
  EngineIcon,
  PuzzleBadgeIcon,
  type DocsProductItem,
} from '@embedpdf/docs-kit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { docsIntegrationFromPath } from '@/lib/docs-integrations';
import {
  DOCS_PRODUCTS,
  docsProductFromPath,
  docsProductHref,
  type DocsProduct,
} from '@/lib/docs-products';

const PRODUCT_ICONS: Record<DocsProduct, ReactNode> = {
  viewer: <BoltBadgeIcon />,
  headless: <PuzzleBadgeIcon />,
  engine: <EngineIcon />,
};

const PRODUCT_TINTS: Record<DocsProduct, string> = {
  viewer: 'bg-[#E3EFFF] text-[#0876FD]',
  headless: 'bg-[#EEE5FF] text-[#7C3AED]',
  engine: 'bg-[#DFF5F1] text-[#087F73]',
};

/** Site binding over the kit switcher: EmbedPDF's products, with hrefs that
 *  carry the reader's active integration between products. */
export function DocsProductSwitcher() {
  const pathname = usePathname();
  const activeProduct = docsProductFromPath(pathname);
  const activeIntegration = docsIntegrationFromPath(pathname);

  const products: DocsProductItem[] = (Object.keys(DOCS_PRODUCTS) as DocsProduct[]).map(
    (product) => ({
      key: product,
      label: DOCS_PRODUCTS[product].label,
      href: docsProductHref(product, activeIntegration),
      icon: PRODUCT_ICONS[product],
      tintClass: PRODUCT_TINTS[product],
    }),
  );

  return (
    <KitSwitcher
      products={products}
      activeKey={activeProduct}
      footer={
        <Link
          href="/docs"
          onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
          className="block rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold text-[var(--dk-muted)] no-underline transition-colors hover:bg-[#F3F7FE] hover:text-[var(--dk-heading)]"
        >
          All documentation
        </Link>
      }
    />
  );
}
