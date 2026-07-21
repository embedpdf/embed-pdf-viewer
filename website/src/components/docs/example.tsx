'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { CheckIcon, CopyIcon, ExternalLink } from '@/components/site/icons';
import {
  DEFAULT_PRODUCT_INTEGRATION,
  DOCS_INTEGRATION_LABELS,
  docsIntegrationFromPath,
  docsIntegrationHref,
  isDocsIntegration,
} from '@/lib/docs-integrations';
import { docsProductFromPath } from '@/lib/docs-products';

type ExampleFile = {
  filename: string;
  code: string;
  language: string;
  githubUrl?: string;
  highlightedCode?: string;
};

/**
 * The route-variant-resolved sample display (DOCS-ARCHITECTURE.md pillar 3).
 * Receives every variant's highlighted files from the build pipeline and
 * renders only the active integration's — or the honest "not yet ported"
 * callout, driven purely by file presence.
 */
/** Mounts a built demo module (public/demos/…) via a NATIVE dynamic import —
 * the module carries its own framework runtime, so Vue/Svelte demos run
 * inside the Next site with no bundler integration at all. */
function DemoMount({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    import(/* webpackIgnore: true */ url)
      .then((mod: { mount: (el: HTMLElement) => () => void }) => {
        if (!cancelled && ref.current) cleanup = mod.mount(ref.current);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [url]);

  if (error) {
    return (
      <p className="text-ep-soft m-0 font-sans text-sm">
        The live preview failed to load — run <code>pnpm build:demos</code> and reload.
      </p>
    );
  }
  return <div ref={ref} className="min-h-[220px]" />;
}

export function Example({
  filesByFramework,
  demosByFramework,
}: {
  filesByFramework?: string;
  demosByFramework?: string;
}) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [activeFile, setActiveFile] = useState(0);
  const product = docsProductFromPath(pathname);
  const integration = docsIntegrationFromPath(pathname);
  const defaultIntegration =
    product === 'viewer'
      ? DEFAULT_PRODUCT_INTEGRATION.viewer
      : DEFAULT_PRODUCT_INTEGRATION.headless;
  const variant = integration ?? defaultIntegration;
  const label = DOCS_INTEGRATION_LABELS[variant];

  const byFramework: Record<string, ExampleFile[]> = filesByFramework
    ? JSON.parse(filesByFramework)
    : {};
  const files = byFramework[variant];

  if (!files || files.length === 0) {
    const fallback = byFramework[defaultIntegration]?.length
      ? defaultIntegration
      : Object.keys(byFramework)[0];
    const fallbackIntegration = isDocsIntegration(fallback) ? fallback : null;
    const fallbackLabel = fallbackIntegration ? DOCS_INTEGRATION_LABELS[fallbackIntegration] : null;
    const fallbackHref = fallbackIntegration
      ? docsIntegrationHref(pathname, fallbackIntegration)
      : null;
    return (
      <div className="mt-6 max-w-[72ch] rounded-[14px] border border-[#E5D6FB] bg-[#F8F4FE] px-[18px] py-4 font-sans text-[15px] leading-[1.6] text-[#4A3A74]">
        This example isn&rsquo;t available for <b>{label}</b> yet.
        {fallback && fallbackHref && fallbackLabel ? (
          <>
            {' '}
            You can read the{' '}
            <Link
              href={fallbackHref}
              className="text-ep-blue font-semibold underline-offset-[3px] hover:underline"
            >
              {fallbackLabel} version
            </Link>{' '}
            in the meantime.
          </>
        ) : null}
      </div>
    );
  }

  const demos: Record<string, string> = demosByFramework ? JSON.parse(demosByFramework) : {};
  const demoUrl = demos[variant];

  const file = files[Math.min(activeFile, files.length - 1)];

  const copy = () => {
    void navigator.clipboard.writeText(file.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="mt-6">
      {demoUrl ? (
        <div className="border-ep-border mb-3 rounded-[14px] border bg-white p-5 shadow-[0_1px_2px_rgba(7,32,76,0.04)]">
          <div className="font-display text-ep-soft mb-3 text-[11px] font-extrabold uppercase tracking-[0.11em]">
            Preview
          </div>
          <DemoMount url={demoUrl} />
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[14px] border border-[#1B2748] bg-[#0B1530] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_12px_32px_-14px_rgba(7,32,76,0.35)]">
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
    </div>
  );
}
