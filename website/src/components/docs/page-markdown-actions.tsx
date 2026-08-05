'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { CheckIcon, CopyIcon, ExternalLink } from '@/components/site/icons';

type CopyState = 'idle' | 'copying' | 'copied' | 'error';

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
    <div className="border-ep-borderSoft mt-6 space-y-1.5 border-t pt-4">
      <button
        type="button"
        onClick={copyPage}
        disabled={copyState === 'copying'}
        className="text-ep-soft hover:bg-ep-tint hover:text-ep-navy flex w-full items-center gap-2 rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-60"
      >
        {copied ? (
          <CheckIcon size={15} className="text-[#2E9B5F]" strokeWidth={2.5} />
        ) : (
          <CopyIcon size={15} />
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
        className="text-ep-soft hover:bg-ep-tint hover:text-ep-navy flex items-center gap-2 rounded-lg px-2.5 py-2 font-sans text-[13.5px] font-semibold no-underline transition-colors"
      >
        <ExternalLink size={15} />
        View as Markdown
      </a>
    </div>
  );
}
