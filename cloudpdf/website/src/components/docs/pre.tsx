'use client';

import type { ComponentProps } from 'react';
import { useRef, useState } from 'react';

import { useInTabs } from '@/components/docs/tabs/index.client';
import { CheckIcon, CopyIcon } from '@/components/site/icons';

type PreProps = ComponentProps<'pre'> & {
  'data-filename'?: string;
};

export function Pre({ children, className, 'data-filename': filename, ...props }: PreProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const inTabs = useInTabs();

  // Inside a Tabs shell (e.g. npm2yarn), render bare so the surrounding
  // cp-cb box owns the chrome (tab bar + copy button).
  if (inTabs) {
    return (
      <pre
        ref={preRef}
        className={`m-0 overflow-x-auto px-[18px] py-[17px] font-mono text-[13px] leading-[1.8] text-[#C8D3EA] [&_code]:bg-transparent [&_code]:p-0 ${className ?? ''}`}
        {...props}
      >
        {children}
      </pre>
    );
  }

  async function copy() {
    const text = preRef.current?.textContent ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative mt-[22px] overflow-hidden rounded-[14px] border border-[#21305F] bg-[#0E1A40] shadow-[0_22px_48px_-26px_rgba(8,24,72,0.5)]">
      {filename && (
        <div className="flex items-center gap-2 border-b border-[#1E2C5A] bg-[#0A1638] px-4 py-2.5 font-mono text-[12.5px] font-semibold text-[#8FA5D9]">
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#5E72A8]"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <span className="truncate">{filename}</span>
        </div>
      )}

      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className={`absolute right-2.5 z-10 inline-flex items-center justify-center rounded-md p-2 text-[#6E82BC] opacity-0 transition hover:bg-white/5 hover:text-[#B7C6EA] focus-visible:opacity-100 group-hover:opacity-100 ${
          filename ? 'top-[7px]' : 'top-2.5'
        }`}
      >
        {copied ? (
          <CheckIcon width={15} height={15} className="text-[#6FE0A0]" strokeWidth={2.6} />
        ) : (
          <CopyIcon width={15} height={15} />
        )}
      </button>

      <pre
        ref={preRef}
        className={`m-0 overflow-x-auto px-[18px] py-[17px] font-mono text-[13px] leading-[1.8] text-[#C8D3EA] [&_code]:bg-transparent [&_code]:p-0 ${className ?? ''}`}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}
