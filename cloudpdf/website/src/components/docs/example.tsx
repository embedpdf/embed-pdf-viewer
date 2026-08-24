'use client';

import { CodeExampleCard, type ExampleFile, type ExampleMode } from '@embedpdf/docs-kit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PRODUCT_INTEGRATION,
  DOCS_INTEGRATION_LABELS,
  docsIntegrationFromPath,
  docsIntegrationHref,
  fanoutProductFromPath,
  isDocsIntegration,
} from '@/lib/docs-integrations';

/** Mounts a built demo module (public/demos/…) via a NATIVE dynamic import —
 * the module carries its own framework runtime, so Vue/Svelte/Angular demos
 * run inside the Next site with no bundler integration at all. Import cost is
 * deferred until the preview is open AND near the viewport; once mounted, a
 * collapse keeps the instance alive (state survives toggling). */
function DemoMount({ url, active }: { url: string; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [started, setStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '256px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (active && inView) setStarted(true);
  }, [active, inView]);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    import(/* webpackIgnore: true */ url)
      .then((mod: { mount: (el: HTMLElement) => () => void }) => {
        if (!cancelled && ref.current) {
          cleanup = mod.mount(ref.current);
          setLoaded(true);
        }
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [started, url]);

  return (
    <div className="relative">
      <div ref={ref} className="min-h-[220px]" />
      {!loaded && !error ? (
        <p className="text-cp-muted absolute inset-0 m-0 flex animate-pulse items-center justify-center font-sans text-sm">
          Loading live preview…
        </p>
      ) : null}
      {error ? (
        <p className="text-cp-muted absolute inset-0 m-0 flex items-center justify-center font-sans text-sm">
          The live preview failed to load — reload the page to try again.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The route-variant-resolved sample display. This site's job is RESOLUTION —
 * which framework's files, which built demo — and the honest not-yet-ported
 * fallback; the kit's CodeExampleCard owns every pixel of the shell, so the
 * "View code" chrome is identical on both docs sites.
 */
export function Example({
  filesByFramework,
  demosByFramework,
  mode = 'default',
}: {
  filesByFramework?: string;
  demosByFramework?: string;
  mode?: ExampleMode;
}) {
  const pathname = usePathname();
  const product = fanoutProductFromPath(pathname);
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

  const demos: Record<string, string> = demosByFramework ? JSON.parse(demosByFramework) : {};
  const demoUrl = demos[variant];

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
      <div className="mt-6 max-w-[72ch] rounded-[14px] border border-[#C9DEFF] bg-[#F2F7FF] px-[18px] py-4 font-sans text-[15px] leading-[1.6] text-[#2A4574]">
        This example isn&rsquo;t available for <b>{label}</b> yet.
        {fallback && fallbackHref && fallbackLabel ? (
          <>
            {' '}
            You can read the{' '}
            <Link
              href={fallbackHref}
              className="text-cp-blue font-semibold underline-offset-[3px] hover:underline"
            >
              {fallbackLabel} version
            </Link>{' '}
            in the meantime.
          </>
        ) : null}
      </div>
    );
  }

  return (
    <CodeExampleCard
      files={files}
      mode={mode}
      demo={demoUrl ? (active) => <DemoMount url={demoUrl} active={active} /> : undefined}
    />
  );
}
