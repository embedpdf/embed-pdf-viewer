'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { CheckIcon, CopyIcon } from './icons';

type CopyState = 'idle' | 'copying' | 'copied' | 'error';

function ExternalLinkIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

/**
 * "Copy page" / "View as Markdown" — fetches the flavor-resolved `.md`
 * projection of the current route (served by the site's markdown route).
 */
export function PageMarkdownActions() {
  const pathname = usePathname();
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const markdownHref = `${pathname}.md`;

  async function copyPage() {
    setCopyState('copying');

    try {
      const response = await fetch(markdownHref, {
        headers: { Accept: 'text/markdown' },
      });
      if (!response.ok) throw new Error(`Markdown request failed with ${response.status}`);

      await navigator.clipboard.writeText(await response.text());
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
    }
  }

  const copied = copyState === 'copied';

  return (
    <div className="mt-6 space-y-1.5 border-t border-[var(--dk-border)] pt-4">
      <button
        type="button"
        onClick={copyPage}
        disabled={copyState === 'copying'}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold text-[var(--dk-muted)] transition-colors hover:bg-[#F3F7FE] hover:text-[var(--dk-heading)] disabled:cursor-wait disabled:opacity-60"
      >
        {copied ? (
          <CheckIcon width={15} height={15} className="text-[#2E9B5F]" strokeWidth={2.5} />
        ) : (
          <CopyIcon width={15} height={15} />
        )}
        {copyState === 'copying'
          ? 'Copying…'
          : copied
            ? 'Copied'
            : copyState === 'error'
              ? 'Try copying again'
              : 'Copy page'}
      </button>
      <a
        href={markdownHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold text-[var(--dk-muted)] no-underline transition-colors hover:bg-[#F3F7FE] hover:text-[var(--dk-heading)]"
      >
        <ExternalLinkIcon />
        View as Markdown
      </a>
    </div>
  );
}
