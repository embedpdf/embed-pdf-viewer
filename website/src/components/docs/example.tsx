'use client';

import Link from 'next/link';
import { useState } from 'react';

import { CheckIcon, CopyIcon, ExternalLink } from '@/components/site/icons';
import { DEFAULT_FRAMEWORK, FRAMEWORK_LABELS, frameworkHref } from '@/lib/frameworks';
import { usePathname } from 'next/navigation';

import { useFramework } from './framework';

type ExampleFile = {
  filename: string;
  code: string;
  language: string;
  githubUrl?: string;
  highlightedCode?: string;
};

/**
 * The framework-resolved sample display (DOCS-ARCHITECTURE.md pillar 3).
 * Receives every framework's highlighted files from the build pipeline and
 * renders only the active framework's — or the honest "not yet ported"
 * callout, driven purely by file presence.
 */
export function Example({ filesByFramework }: { filesByFramework?: string }) {
  const fw = useFramework();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [activeFile, setActiveFile] = useState(0);

  const byFramework: Record<string, ExampleFile[]> = filesByFramework
    ? JSON.parse(filesByFramework)
    : {};
  const files = byFramework[fw];

  if (!files || files.length === 0) {
    const fallback = byFramework[DEFAULT_FRAMEWORK]?.length
      ? DEFAULT_FRAMEWORK
      : Object.keys(byFramework)[0];
    return (
      <div className="mt-6 max-w-[72ch] rounded-[14px] border border-[#E5D6FB] bg-[#F8F4FE] px-[18px] py-4 font-sans text-[15px] leading-[1.6] text-[#4A3A74]">
        This example isn&rsquo;t available for <b>{FRAMEWORK_LABELS[fw]}</b> yet — it arrives with
        the {FRAMEWORK_LABELS[fw]} adapter.
        {fallback ? (
          <>
            {' '}
            You can read the{' '}
            <Link
              href={frameworkHref(
                pathname.replace(`/headless/${fw}`, '/headless'),
                fallback as never,
              )}
              className="text-ep-blue font-semibold underline-offset-[3px] hover:underline"
            >
              {FRAMEWORK_LABELS[fallback as never]} version
            </Link>{' '}
            in the meantime.
          </>
        ) : null}
      </div>
    );
  }

  const file = files[Math.min(activeFile, files.length - 1)];

  const copy = () => {
    void navigator.clipboard.writeText(file.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-[#1B2748] bg-[#0B1530] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_12px_32px_-14px_rgba(7,32,76,0.35)]">
      <div className="flex items-center justify-between border-b border-[#18233D] bg-[#070C19] py-1.5 pl-1.5 pr-2">
        <div className="flex gap-0.5">
          {files.map((f, i) => (
            <button
              key={f.filename}
              onClick={() => setActiveFile(i)}
              className={`rounded-md px-2.5 py-1.5 font-mono text-[12px] transition-colors ${
                i === Math.min(activeFile, files.length - 1)
                  ? 'bg-[#1E2C5A] text-white'
                  : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
              }`}
            >
              {f.filename}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {file.githubUrl ? (
            <a
              href={file.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on GitHub"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8FA5D9] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ExternalLink size={13} />
            </a>
          ) : null}
          <button
            onClick={copy}
            aria-label="Copy code"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              copied ? 'text-[#A5E3B6]' : 'text-[#8FA5D9] hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {copied ? <CheckIcon size={14} strokeWidth={2.5} /> : <CopyIcon size={14} />}
          </button>
        </div>
      </div>
      <pre className="ep-code m-0 overflow-x-auto whitespace-pre px-[18px] py-4 font-mono text-[13px] leading-[1.8] text-[#C8D3EA] [tab-size:2]">
        <code dangerouslySetInnerHTML={{ __html: file.highlightedCode ?? file.code }} />
      </pre>
    </div>
  );
}
