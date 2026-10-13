'use client';

import {
  CodeExampleCard,
  type ExampleFile,
  type ExampleFrame,
  type ExampleMode,
} from '@embedpdf/docs-kit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PRODUCT_INTEGRATION,
  DOCS_INTEGRATION_LABELS,
  docsIntegrationFromPath,
  docsIntegrationHref,
  isDocsIntegration,
} from '@/lib/docs-integrations';
import { docsProductFromPath } from '@/lib/docs-products';

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
    <div className="relative h-full">
      <div ref={ref} className="h-full min-h-[220px]" />
      {!loaded && !error ? (
        <p className="text-ep-soft absolute inset-0 m-0 flex animate-pulse items-center justify-center font-sans text-sm">
          Loading live preview…
        </p>
      ) : null}
      {error ? (
        <p className="text-ep-soft absolute inset-0 m-0 flex items-center justify-center font-sans text-sm">
          The live preview failed to load — run <code className="mx-1">pnpm build:demos</code> and
          reload.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A bigger preview than an example gets by default: `tall`, or `wide`, which is as tall and on a
 * wide screen also takes the table of contents' column (the card covers it while it scrolls by).
 */
export type ExampleSize = 'tall' | 'wide';

/**
 * The preview's frame: a ready-made viewer example (`viewer/…`) fills a frame that suits the docs
 * column, which `size` makes bigger; other examples are as tall as they are, unless `size` says.
 */
function frameOf(name: string | undefined, size: ExampleSize | undefined): ExampleFrame {
  if (size === 'tall' || size === 'wide') return 'tall';
  return name?.startsWith('viewer/') ? 'viewer' : 'content';
}

/** The table of contents' column (toc.tsx) and the gap before it (docs-page.tsx). */
const WIDE = 'relative z-10 md:w-[calc(100%+268px+clamp(28px,4vw,60px))]';

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
  kind = 'example',
  available,
  name,
  size,
}: {
  filesByFramework?: string;
  demosByFramework?: string;
  mode?: ExampleMode;
  /** A `<Snippet>` is code only; its gap note says so. */
  kind?: 'example' | 'snippet';
  /**
   * The frameworks that have a version, when the server only sent the route's framework's files
   * (`RouteExample`); the "not available yet" note picks its link from it.
   */
  available?: readonly string[];
  /** The sample's name, as the page writes it (`viewer/quick-start/customized`). */
  name?: string;
  /** A bigger preview (`<Example size="tall">`). */
  size?: ExampleSize;
}) {
  const pathname = usePathname();
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

  const demos: Record<string, string> = demosByFramework ? JSON.parse(demosByFramework) : {};
  const demoUrl = demos[variant];

  if (!files || files.length === 0) {
    const versions = available ?? Object.keys(byFramework).filter((fw) => byFramework[fw]?.length);
    const fallback = versions.includes(defaultIntegration) ? defaultIntegration : versions[0];
    const fallbackIntegration = isDocsIntegration(fallback) ? fallback : null;
    const fallbackLabel = fallbackIntegration ? DOCS_INTEGRATION_LABELS[fallbackIntegration] : null;
    const fallbackHref = fallbackIntegration
      ? docsIntegrationHref(pathname, fallbackIntegration)
      : null;
    return (
      <div className="mt-6 max-w-[72ch] rounded-[14px] border border-[#E5D6FB] bg-[#F8F4FE] px-[18px] py-4 font-sans text-[15px] leading-[1.6] text-[#4A3A74]">
        {kind === 'snippet' ? 'This code isn’t written for ' : 'This example isn’t available for '}
        <b>{label}</b> yet.
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

  const card = (
    <CodeExampleCard
      files={files}
      mode={mode}
      frame={frameOf(name, size)}
      demo={demoUrl ? (active) => <DemoMount url={demoUrl} active={active} /> : undefined}
    />
  );
  return size === 'wide' ? <div className={WIDE}>{card}</div> : card;
}
