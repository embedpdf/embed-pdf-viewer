'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { CheckIcon, CopyIcon } from './icons';

/**
 * THE code-example shell — the "View code" card. One presentational
 * component for every sample display on both sites:
 *
 *   - live demo + code   → preview surface, control bar, collapsible editor
 *   - code only          → the dark editor card alone (no dead preview box)
 *   - demo only          → the preview surface alone (mode="demo")
 *
 * The chrome invariant: the last open region can't collapse, so the card is
 * never empty; the code toggle keeps its place on the left in every state.
 * Sites keep resolution (which files, which demo) and pass the results in.
 */
export type ExampleFile = {
  filename: string;
  code: string;
  language?: string;
  githubUrl?: string;
  highlightedCode?: string;
};

export type ExampleMode = 'default' | 'open' | 'demo' | 'code';

type Tone = 'light' | 'dark';

const ICON_BTN: Record<Tone, string> = {
  light: 'text-[var(--dk-muted)] hover:bg-[var(--dk-accent-surface)] hover:text-[var(--dk-heading)]',
  dark: 'text-[#8FA5D9] hover:bg-white/[0.06] hover:text-white',
};

function ChevronDownIcon({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
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

function CodeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}

function EyeIcon({ size = 14, off = false }: { size?: number; off?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {off ? (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.66.41.35.77 1.05.77 2.12v3.15c0 .3.2.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

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

/** Expand/collapse via the grid `0fr → 1fr` trick: animates height:auto with
 * no measurement. Content stays in the DOM (collapsed demos keep running). */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
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
function PreviewSurface({ children }: { children: ReactNode }) {
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
      {copied ? <CheckIcon width={14} height={14} strokeWidth={2.5} /> : <CopyIcon width={14} height={14} />}
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
        <GitHubIcon />
      </a>
    );
  }

  const menu =
    tone === 'light'
      ? 'border border-[var(--dk-border)] bg-white shadow-[0_16px_36px_-12px_rgba(7,32,76,0.22)]'
      : 'border border-[#21305F] bg-[#0E1A40] shadow-[0_16px_36px_-12px_rgba(4,10,30,0.8)]';
  const head = tone === 'light' ? 'text-[#8FA0C4]' : 'text-[#5E72A8]';
  const item =
    tone === 'light'
      ? 'text-[var(--dk-muted)] hover:bg-[#F3F7FE] hover:text-[var(--dk-heading)]'
      : 'text-[#8FA5D9] hover:bg-white/[0.06] hover:text-white';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="View on GitHub"
        title="View on GitHub"
        className={`inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 transition-colors ${ICON_BTN[tone]}`}
      >
        <GitHubIcon />
        <ChevronDownIcon size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
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

/** The dark file bar — tabs for multi-file, a filename for single — sitting
 * directly on the dark code, plus an optional right-side action slot. */
function FileBar({
  files,
  activeFile,
  onSelect,
  right,
}: {
  files: ExampleFile[];
  activeFile: number;
  onSelect: (index: number) => void;
  right?: ReactNode;
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
    <pre className="dk-dark-scroll m-0 max-h-[520px] overflow-auto whitespace-pre bg-[#0B1530] px-[18px] py-4 font-mono text-[13px] leading-[1.8] text-[#C8D3EA] [tab-size:2]">
      <code dangerouslySetInnerHTML={{ __html: file.highlightedCode ?? escapeHtml(file.code) }} />
    </pre>
  );
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function CodeExampleCard({
  files,
  demo,
  mode = 'default',
}: {
  files: ExampleFile[];
  /** The live preview; receives whether the preview region is open. */
  demo?: (active: boolean) => ReactNode;
  mode?: ExampleMode;
}) {
  const [activeFile, setActiveFile] = useState(0);
  const hasDemo = Boolean(demo);
  const [previewOpen, setPreviewOpen] = useState(hasDemo && mode !== 'code');
  const [codeOpen, setCodeOpen] = useState(!hasDemo || mode === 'open' || mode === 'code');

  if (files.length === 0 && !hasDemo) return null;

  const active = Math.min(activeFile, Math.max(files.length - 1, 0));
  const file = files[active];
  const totalLines = files.reduce((sum, f) => sum + f.code.trim().split('\n').length, 0);

  // No live demo → the card is just a code block: the dark file bar carries
  // the actions, and it reads exactly like a standalone code fence.
  if (!hasDemo) {
    return (
      <div className="mt-6 overflow-hidden rounded-[14px] border border-[#1B2748] bg-[#0B1530] shadow-[0_12px_32px_-14px_rgba(7,32,76,0.35)]">
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
  if (mode === 'demo' || files.length === 0) {
    return (
      <div className="mt-6 overflow-hidden rounded-[14px] border border-[var(--dk-border)] shadow-[0_1px_2px_rgba(7,32,76,0.04)]">
        <PreviewSurface>{demo?.(true)}</PreviewSurface>
      </div>
    );
  }

  const barBorder = previewOpen ? 'border-t border-[var(--dk-border)]' : '';
  const canCollapseCode = previewOpen; // else code is the only content left

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-[var(--dk-border)] bg-white shadow-[0_1px_2px_rgba(7,32,76,0.04)]">
      <Collapsible open={previewOpen}>
        <PreviewSurface>{demo?.(previewOpen)}</PreviewSurface>
      </Collapsible>

      <div
        className={`flex items-center justify-between bg-[#F3F7FE] py-1.5 pl-1.5 pr-2 ${barBorder}`}
      >
        {!codeOpen ? (
          <button
            onClick={() => setCodeOpen(true)}
            className="group inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 font-sans text-[12.5px] font-semibold text-[var(--dk-muted)] transition-colors hover:text-[var(--dk-heading)]"
          >
            <CodeIcon />
            View code
            <span className="font-normal text-[#8FA0C4]">
              {totalLines} lines{files.length > 1 ? ` · ${files.length} files` : ''}
            </span>
            <ChevronDownIcon className="text-[#8FA0C4] transition-colors group-hover:text-[var(--dk-heading)]" />
          </button>
        ) : canCollapseCode ? (
          <button
            onClick={() => setCodeOpen(false)}
            className="group inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 font-sans text-[12.5px] font-semibold text-[var(--dk-muted)] transition-colors hover:text-[var(--dk-heading)]"
          >
            <CodeIcon />
            Hide code
            <ChevronDownIcon className="rotate-180 text-[#8FA0C4] transition-colors group-hover:text-[var(--dk-heading)]" />
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 px-2.5 py-1.5 font-sans text-[12.5px] font-semibold text-[var(--dk-muted)]">
            <CodeIcon />
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
              <EyeIcon off={previewOpen} />
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
