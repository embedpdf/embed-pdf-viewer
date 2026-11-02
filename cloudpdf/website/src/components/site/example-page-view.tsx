'use client';

import { CodeFiles, type ExampleFile } from '@embedpdf/docs-kit';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DemoMount } from '@/components/docs/example';
import { IntegrationLogo } from '@/components/site/integration-logo';
import {
  DOCS_INTEGRATION_LABELS,
  INTEGRATION_COOKIE,
  isDocsIntegration,
  type DocsIntegration,
} from '@/lib/docs-integrations';
import { exampleCodeHref, exampleDocsHref } from '@/lib/examples';

/**
 * An example on a page of its own (`lib/examples.ts`): a bar with its name, then the example in
 * the rest of the window. The example ends where the window does, with the footer below it: 85px
 * is the site's header and its border.
 *
 * Every integration's version looks the same, so the page runs one, and its code slides in from
 * the right in the integration the reader picks, at first the docs' own (their cookie). On a wide
 * screen the code then sits beside the example, so both can be used at once.
 */
export function ExamplePageView({
  slug,
  title,
  demo,
  integrations,
}: {
  slug: string;
  title: string;
  /** The build the page runs. */
  demo: string;
  /** The integrations whose code it shows. */
  integrations: DocsIntegration[];
}) {
  const [open, setOpen] = useState(false);
  // Beside the example rather than over it: once the panel is in.
  const [docked, setDocked] = useState(false);
  const [integration, setIntegration] = useState(integrations[0]);
  const [code, setCode] = useState<Partial<Record<DocsIntegration, ExampleFile[] | 'failed'>>>({});
  const requested = useRef(new Set<DocsIntegration>());
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = document.cookie.match(new RegExp(`(?:^|; )${INTEGRATION_COOKIE}=([^;]+)`))?.[1];
    if (isDocsIntegration(saved) && integrations.includes(saved)) setIntegration(saved);
  }, [integrations]);

  // Fetched once per integration, as soon as the reader heads for the code.
  const load = useCallback(
    (which: DocsIntegration) => {
      if (requested.current.has(which)) return;
      requested.current.add(which);
      fetch(exampleCodeHref(slug, which))
        .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
        .then(
          (files: ExampleFile[]) => setCode((all) => ({ ...all, [which]: files })),
          () => {
            requested.current.delete(which);
            setCode((all) => ({ ...all, [which]: 'failed' }));
          },
        );
    },
    [slug],
  );
  useEffect(() => {
    if (open) load(integration);
  }, [open, integration, load]);
  useEffect(() => {
    if (open) close.current?.focus({ preventScroll: true });
  }, [open]);

  const show = () => {
    setOpen(true);
    // No slide to wait for.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setDocked(true);
  };
  const hide = () => {
    setOpen(false);
    setDocked(false);
    toggle.current?.focus({ preventScroll: true });
  };
  const pick = (next: DocsIntegration) => {
    setIntegration(next);
    // The docs open in it too, as their own switcher does.
    document.cookie = `${INTEGRATION_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
  };
  const files = code[integration];

  return (
    <main className="bg-cp-bg flex h-[calc(100svh-85px)] min-h-[520px] flex-col">
      <div className="shrink-0 border-b border-[#EEF2FA] bg-white">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-[clamp(16px,4vw,78px)]">
          <nav aria-label="Breadcrumb" className="hidden shrink-0 items-center gap-2 sm:flex">
            <Link
              href="/examples"
              className="text-cp-muted hover:text-cp-navy font-sans text-[14px] font-medium transition-colors"
            >
              Examples
            </Link>
            <span aria-hidden className="font-sans text-[14px] text-[#8FA0C4]">
              /
            </span>
          </nav>
          <h1 className="font-display text-cp-navy m-0 min-w-0 truncate text-[16px] font-bold">
            {title}
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              ref={toggle}
              type="button"
              aria-expanded={open}
              aria-controls="example-code"
              onPointerEnter={() => load(integration)}
              onClick={() => (open ? hide() : show())}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 font-sans text-[13.5px] font-semibold transition-colors ${
                open ? 'bg-cp-navy text-white' : 'bg-cp-blue hover:bg-cp-blue600 text-white'
              }`}
            >
              <CodeGlyph />
              {open ? 'Hide code' : 'View code'}
            </button>
            <Link
              href={exampleDocsHref(slug, integration)}
              className="border-cp-border text-cp-navy inline-flex h-9 items-center rounded-lg border bg-white px-3 font-sans text-[13.5px] font-semibold transition-colors hover:bg-[#F6F8FC]"
            >
              <span className="sm:hidden">Docs</span>
              <span className="hidden sm:inline">How it’s built</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          data-example
          className={`absolute inset-y-0 left-0 right-0 ${docked ? 'xl:right-[min(760px,50%)]' : ''}`}
        >
          <DemoMount url={demo} active />
        </div>

        <aside
          id="example-code"
          aria-label="Code"
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === 'translate' && open)
              setDocked(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') hide();
          }}
          className={`absolute inset-y-0 right-0 z-10 flex w-full flex-col bg-[#0B1530] shadow-[-24px_0_48px_-24px_rgba(7,32,76,0.5)] duration-300 ease-out motion-reduce:transition-none md:w-[min(720px,64%)] xl:w-[min(760px,50%)] ${
            // Seen as it starts sliding in, so it can take the focus; hidden once it's out.
            open
              ? 'visible translate-x-0 transition-[translate]'
              : 'invisible translate-x-full transition-[translate,visibility]'
          }`}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-[#1E2C5A] bg-[#081230] py-2 pl-2 pr-2">
            <div
              role="group"
              aria-label="Integration"
              className="flex min-w-0 gap-0.5 overflow-x-auto"
            >
              {integrations.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={candidate === integration}
                  onClick={() => pick(candidate)}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-sans text-[13px] font-semibold transition-colors ${
                    candidate === integration
                      ? 'bg-[#1E2C5A] text-white'
                      : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
                  }`}
                >
                  <IntegrationLogo integration={candidate} size={15} />
                  {DOCS_INTEGRATION_LABELS[candidate]}
                </button>
              ))}
            </div>
            <button
              ref={close}
              type="button"
              aria-label="Close the code"
              onClick={hide}
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8FA5D9] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <CloseGlyph />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {Array.isArray(files) ? (
              <CodeFiles key={integration} files={files} />
            ) : (
              <p className="m-0 p-6 font-sans text-[14px] text-[#8FA5D9]">
                {files === 'failed' ? (
                  <>
                    The code didn’t load.{' '}
                    <button
                      type="button"
                      onClick={() => load(integration)}
                      className="font-semibold text-white underline underline-offset-[3px]"
                    >
                      Try again
                    </button>
                  </>
                ) : (
                  'Loading the code…'
                )}
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function CodeGlyph() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
