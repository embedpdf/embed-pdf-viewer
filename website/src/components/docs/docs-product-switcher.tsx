'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

import {
  BoltBadgeIcon,
  CheckIcon,
  ChevronDown,
  EngineIcon,
  PuzzleBadgeIcon,
} from '@/components/site/icons';
import { docsIntegrationFromPath } from '@/lib/docs-integrations';
import {
  DOCS_PRODUCTS,
  docsProductFromPath,
  docsProductHref,
  type DocsProduct,
} from '@/lib/docs-products';

const PRODUCT_ICONS: Record<DocsProduct, ReactNode> = {
  viewer: <BoltBadgeIcon size={15} />,
  headless: <PuzzleBadgeIcon size={15} />,
  engine: <EngineIcon size={15} />,
};

const PRODUCT_ICON_STYLES: Record<DocsProduct, string> = {
  viewer: 'bg-[#E3EFFF] text-[#0876FD]',
  headless: 'bg-[#EEE5FF] text-[#7C3AED]',
  engine: 'bg-[#DFF5F1] text-[#087F73]',
};

export function DocsProductSwitcher() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const activeProduct = docsProductFromPath(pathname);
  const activeIntegration = docsIntegrationFromPath(pathname);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.removeAttribute('open');
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key === 'Escape' && details?.open) {
        details.removeAttribute('open');
        summaryRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  if (!activeProduct) return null;

  const active = DOCS_PRODUCTS[activeProduct];

  return (
    <div className="mb-7 px-3">
      <span className="font-display text-ep-soft text-[11px] font-extrabold uppercase tracking-[0.11em]">
        Documentation
      </span>

      <details ref={detailsRef} className="group relative mt-2">
        <summary
          ref={summaryRef}
          className="border-ep-border text-ep-navy hover:border-ep-blue/40 flex cursor-pointer list-none items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 font-sans text-[14px] font-bold shadow-[0_8px_24px_-22px_rgba(7,32,76,0.5)] transition-colors [&::-webkit-details-marker]:hidden"
        >
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${PRODUCT_ICON_STYLES[activeProduct]}`}
          >
            {PRODUCT_ICONS[activeProduct]}
          </span>
          <span>{active.label}</span>
          <ChevronDown
            size={14}
            className="text-ep-soft ml-auto transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="border-ep-border absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border bg-white p-1.5 shadow-[0_18px_45px_-18px_rgba(7,32,76,0.3)]">
          {(Object.keys(DOCS_PRODUCTS) as DocsProduct[]).map((product) => {
            const item = DOCS_PRODUCTS[product];
            const isActive = product === activeProduct;

            return (
              <Link
                key={product}
                href={docsProductHref(product, activeIntegration)}
                aria-current={isActive ? 'page' : undefined}
                onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold no-underline transition-colors ${
                  isActive
                    ? 'bg-ep-mist text-ep-blue700'
                    : 'text-ep-slate hover:bg-ep-tint hover:text-ep-navy'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${PRODUCT_ICON_STYLES[product]}`}
                >
                  {PRODUCT_ICONS[product]}
                </span>
                {item.label}
                {isActive && <CheckIcon size={13} className="text-ep-blue ml-auto" />}
              </Link>
            );
          })}

          <div className="border-ep-borderSoft mt-1 border-t pt-1">
            <Link
              href="/docs"
              onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
              className="text-ep-soft hover:bg-ep-tint hover:text-ep-navy block rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold no-underline transition-colors"
            >
              All documentation
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}
