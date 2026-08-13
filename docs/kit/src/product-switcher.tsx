'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

import { CheckIcon } from './icons';

/**
 * The docs product dropdown ("Documentation ▾ Viewer / Headless / …").
 * Purely presentational: each site supplies its product list, resolved
 * hrefs (integration-aware on embedpdf), and the active key. Same
 * details/summary interaction as the original EmbedPDF switcher.
 */
export interface DocsProductItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Tailwind classes for the icon chip, e.g. 'bg-[#E3EFFF] text-[#0876FD]'. */
  tintClass: string;
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function DocsProductSwitcher({
  products,
  activeKey,
  footer,
}: {
  products: DocsProductItem[];
  activeKey: string | null;
  footer?: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

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

  const active = products.find((product) => product.key === activeKey);
  if (!active) return null;

  return (
    <div className="mb-7 px-3">
      <span className="font-display text-[11px] font-extrabold uppercase tracking-[0.11em] text-[var(--dk-muted)]">
        Documentation
      </span>

      <details ref={detailsRef} className="group relative mt-2">
        <summary
          ref={summaryRef}
          className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl border border-[var(--dk-border)] bg-white px-3 py-2.5 font-sans text-[14px] font-bold text-[var(--dk-heading)] shadow-[0_8px_24px_-22px_rgba(7,32,76,0.5)] transition-colors hover:border-[var(--dk-accent)]/40 [&::-webkit-details-marker]:hidden"
        >
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${active.tintClass}`}
          >
            {active.icon}
          </span>
          <span>{active.label}</span>
          <ChevronDown className="ml-auto text-[var(--dk-muted)] transition-transform group-open:rotate-180" />
        </summary>

        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-[var(--dk-border)] bg-white p-1.5 shadow-[0_18px_45px_-18px_rgba(7,32,76,0.3)]">
          {products.map((product) => {
            const isActive = product.key === activeKey;
            return (
              <Link
                key={product.key}
                href={product.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold no-underline transition-colors ${
                  isActive
                    ? 'bg-[var(--dk-accent-surface)] text-[var(--dk-accent)]'
                    : 'text-[var(--dk-muted)] hover:bg-[#F3F7FE] hover:text-[var(--dk-heading)]'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${product.tintClass}`}
                >
                  {product.icon}
                </span>
                {product.label}
                {isActive && (
                  <CheckIcon width={13} height={13} className="ml-auto text-[var(--dk-accent)]" />
                )}
              </Link>
            );
          })}

          {footer ? (
            <div className="mt-1 border-t border-[var(--dk-border)] pt-1">{footer}</div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
