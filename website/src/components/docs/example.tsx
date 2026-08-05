'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  CheckIcon,
  ChevronDown,
  CodeIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GitHubIcon,
} from '@/components/site/icons';
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
 * Author intent for `<Example>` (DOCS-ARCHITECTURE.md pillar 3): which
 * representation is the hero. Presence stays data-driven — a variant with no
 * built demo degrades to a plain (Pre-style) code block no matter the mode.
 *
 *   default — demo hero, code behind "View code"
 *   open    — demo + code both expanded
 *   demo    — demo only, no chrome
 *   code    — code hero, demo behind the preview toggle
 */
type ExampleMode = 'default' | 'open' | 'demo' | 'code';

type Tone = 'light' | 'dark';

const ICON_BTN: Record<Tone, string> = {
  light: 'text-ep-soft hover:bg-ep-mist hover:text-ep-navy',
  dark: 'text-[#8FA5D9] hover:bg-white/[0.06] hover:text-white',
};

/** The dark filename glyph, matching the standalone <Pre> code-fence header. */
function FileGlyph() {
  return (
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
  );
}

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

/** Expand/collapse via the grid `0fr → 1fr` trick: animates height:auto with
 * no measurement. Content stays in the DOM (collapsed demos keep running). */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** The dotted light surface the demo sits on. */
function PreviewSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white p-5 [background-image:radial-gradient(#DCE3F0_1px,transparent_1px)] [background-size:16px_16px] sm:p-6">
      {children}
    </div>
  );
}

function CopyButton({ code, tone }: { code: string; tone: Tone }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  const done = tone === 'light' ? 'text-emerald-600' : 'text-[#A5E3B6]';
  return (
    <button
      onClick={copy}
      aria-label="Copy code"
      title="Copy code"
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        copied ? done : ICON_BTN[tone]
      }`}
    >
      {copied ? <CheckIcon size={14} strokeWidth={2.5} /> : <CopyIcon size={14} />}
    </button>
  );
}

function GitHubAction({ files, tone }: { files: ExampleFile[]; tone: Tone }) {
  const linked = files.filter((file) => file.githubUrl);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (linked.length === 0) return null;

  if (linked.length === 1) {
    return (
      <a
        href={linked[0].githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View on GitHub"
        title="View on GitHub"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${ICON_BTN[tone]}`}
      >
        <GitHubIcon size={14} />
      </a>
    );
  }

  const menu =
    tone === 'light'
      ? 'border-ep-border border bg-white shadow-[0_16px_36px_-12px_rgba(7,32,76,0.22)]'
      : 'border border-[#21305F] bg-[#0E1A40] shadow-[0_16px_36px_-12px_rgba(4,10,30,0.8)]';
  const head = tone === 'light' ? 'text-ep-faint' : 'text-[#5E72A8]';
  const item =
    tone === 'light'
      ? 'text-ep-soft hover:bg-ep-tint hover:text-ep-navy'
      : 'text-[#8FA5D9] hover:bg-white/[0.06] hover:text-white';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="View on GitHub"
        title="View on GitHub"
        className={`inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 transition-colors ${ICON_BTN[tone]}`}
      >
        <GitHubIcon size={14} />
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          className={`absolute right-0 top-full z-50 mt-1.5 min-w-[210px] overflow-hidden rounded-[10px] py-1 ${menu}`}
        >
          <div
            className={`px-3 pb-1 pt-1.5 font-sans text-[10.5px] font-bold uppercase tracking-[0.1em] ${head}`}
          >
            View on GitHub
          </div>
          {linked.map((file) => (
            <a
              key={file.filename}
              href={file.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`block px-3 py-1.5 font-mono text-[12px] transition-colors ${item}`}
              onClick={() => setOpen(false)}
            >
              {file.filename}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The dark file bar — tabs for multi-file, a Pre-style filename for single —
 * sitting directly on the dark code, plus an optional right-side action slot. */
function FileBar({
  files,
  activeFile,
  onSelect,
  right,
}: {
  files: ExampleFile[];
  activeFile: number;
  onSelect: (index: number) => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#1E2C5A] bg-[#0A1638] py-1.5 pl-2 pr-2">
      {files.length > 1 ? (
        <div className="flex gap-0.5 overflow-x-auto">
          {files.map((f, i) => (
            <button
              key={f.filename}
              onClick={() => onSelect(i)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 font-mono text-[12px] transition-colors ${
                i === activeFile
                  ? 'bg-[#1E2C5A] text-white'
                  : 'text-[#8FA5D9] hover:bg-white/5 hover:text-[#C7DEFF]'
              }`}
            >
              {f.filename}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-1.5 font-mono text-[12.5px] font-semibold text-[#8FA5D9]">
          <FileGlyph />
          <span className="truncate">{files[0].filename}</span>
        </div>
      )}
      {right ? <div className="flex items-center gap-1">{right}</div> : null}
    </div>
  );
}

function CodePane({ file }: { file: ExampleFile }) {
  return (
    <pre className="ep-code ep-dark-scroll bg-ep-codebg m-0 max-h-[520px] overflow-auto whitespace-pre px-[18px] py-4 font-mono text-[13px] leading-[1.8] text-[#C8D3EA] [tab-size:2]">
      <code dangerouslySetInnerHTML={{ __html: file.highlightedCode ?? file.code }} />
    </pre>
  );
}

/**
 * The route-variant-resolved sample display: a light card whose control bar is
 * the seam between the live preview and the (Pre-matching) dark code editor.
 * The chrome invariant: the last open region can't collapse, so the card is
 * never empty; the code toggle keeps its place on the left in every state.
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

  const demos: Record<string, string> = demosByFramework ? JSON.parse(demosByFramework) : {};
  const demoUrl = demos[variant];
  const hasDemo = Boolean(demoUrl);

  const [previewOpen, setPreviewOpen] = useState(hasDemo && mode !== 'code');
  const [codeOpen, setCodeOpen] = useState(!hasDemo || mode === 'open' || mode === 'code');

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

  const active = Math.min(activeFile, files.length - 1);
  const file = files[active];
  const totalLines = files.reduce((sum, f) => sum + f.code.trim().split('\n').length, 0);

  // No live demo → the Example is just a code block: the dark file bar carries
  // the actions, and it reads exactly like a standalone <Pre> fence.
  if (!hasDemo) {
    return (
      <div className="bg-ep-codebg mt-6 overflow-hidden rounded-[14px] border border-[#1B2748] shadow-[0_12px_32px_-14px_rgba(7,32,76,0.35)]">
        <FileBar
          files={files}
          activeFile={active}
          onSelect={setActiveFile}
          right={
            <>
              <CopyButton code={file.code} tone="dark" />
              <GitHubAction files={files} tone="dark" />
            </>
          }
        />
        <CodePane file={file} />
      </div>
    );
  }

  // Demo-only showcase: no chrome at all — a light card, just the demo.
  if (mode === 'demo') {
    return (
      <div className="border-ep-border mt-6 overflow-hidden rounded-[14px] border shadow-[0_1px_2px_rgba(7,32,76,0.04)]">
        <PreviewSurface>
          <DemoMount url={demoUrl} active />
        </PreviewSurface>
      </div>
    );
  }

  // The control bar carries a top border only when a visible preview sits above.
  const barBorder = previewOpen ? 'border-ep-border border-t' : '';
  const canCollapseCode = previewOpen; // else code is the only content left

  return (
    <div className="border-ep-border mt-6 overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_2px_rgba(7,32,76,0.04)]">
      <Collapsible open={previewOpen}>
        <PreviewSurface>
          <DemoMount url={demoUrl} active={previewOpen} />
        </PreviewSurface>
      </Collapsible>

      <div
        className={`bg-ep-tint flex items-center justify-between py-1.5 pl-1.5 pr-2 ${barBorder}`}
      >
        {!codeOpen ? (
          <button
            onClick={() => setCodeOpen(true)}
            className="text-ep-soft hover:text-ep-navy group inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 font-sans text-[12.5px] font-semibold transition-colors"
          >
            <CodeIcon size={14} />
            View code
            <span className="text-ep-faint font-normal">
              {totalLines} lines{files.length > 1 ? ` · ${files.length} files` : ''}
            </span>
            <ChevronDown
              size={12}
              className="text-ep-faint group-hover:text-ep-navy transition-colors"
            />
          </button>
        ) : canCollapseCode ? (
          <button
            onClick={() => setCodeOpen(false)}
            className="text-ep-soft hover:text-ep-navy group inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 font-sans text-[12.5px] font-semibold transition-colors"
          >
            <CodeIcon size={14} />
            Hide code
            <ChevronDown
              size={12}
              className="text-ep-faint group-hover:text-ep-navy rotate-180 transition-colors"
            />
          </button>
        ) : (
          <span className="text-ep-soft inline-flex items-center gap-2 px-2.5 py-1.5 font-sans text-[12.5px] font-semibold">
            <CodeIcon size={14} />
            Code
          </span>
        )}

        <div className="flex items-center gap-1">
          {codeOpen ? (
            <button
              onClick={() => setPreviewOpen((v) => !v)}
              aria-label={previewOpen ? 'Hide preview' : 'Show preview'}
              title={previewOpen ? 'Hide preview' : 'Show preview'}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${ICON_BTN.light}`}
            >
              {previewOpen ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
            </button>
          ) : null}
          {codeOpen ? <CopyButton code={file.code} tone="light" /> : null}
          <GitHubAction files={files} tone="light" />
        </div>
      </div>

      <Collapsible open={codeOpen}>
        <FileBar files={files} activeFile={active} onSelect={setActiveFile} />
        <CodePane file={file} />
      </Collapsible>
    </div>
  );
}
