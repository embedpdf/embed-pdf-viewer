import { getDocsHighlighter, highlightCodeFile } from '@embedpdf/docs-kit/mdx/highlight';

import { CopyButton } from './copy-button';

export type CodeFile = {
  filename: string;
  /** A shiki language id: `tsx`, `vue`, `svelte`, `angular-ts`, `bash`… */
  language: string;
  code: string;
};

/**
 * A dark editor card with one highlighted file, rendered on the server at
 * build time. The highlighting is the docs' own (`@embedpdf/docs-kit/mdx/highlight`):
 * same theme, same whitespace rules, and install lines get the release
 * channel stamped exactly like the docs do.
 */
export async function CodeWindow({
  file,
  className = '',
  compact = false,
  fill = false,
}: {
  file: CodeFile;
  className?: string;
  /** Smaller type for the hero's floating card. */
  compact?: boolean;
  /** Fill a fixed-height box and scroll inside it, instead of growing with the code. */
  fill?: boolean;
}) {
  const highlighter = await getDocsHighlighter();
  const highlighted = highlightCodeFile(highlighter, { ...file });

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[#1B2748] bg-[#0B1530] ${fill ? 'flex h-full flex-col' : ''} shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_0_0_1px_rgba(8,118,253,0.12),0_24px_56px_-24px_rgba(7,32,76,0.55)] ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-[#18233D] bg-[#070C19] py-2 pl-4 pr-2">
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#24304F]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#24304F]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#24304F]" />
        </span>
        <span className="font-mono text-xs font-medium text-[#8FA5D9]">{file.filename}</span>
        <span className="flex-1" />
        <CopyButton code={highlighted.code} />
      </div>
      <pre
        className={`ep-dark-scroll m-0 overflow-x-auto bg-[#0B1220] font-mono text-[#C8D3EA] [tab-size:2] ${
          fill ? 'min-h-0 flex-1 overflow-y-auto' : ''
        } ${
          compact
            ? 'px-4 py-4 text-[12px] leading-[1.6]'
            : 'px-5 py-5 text-[13px] leading-[1.65] max-[720px]:text-xs'
        }`}
      >
        {highlighted.highlightedCode ? (
          <code dangerouslySetInnerHTML={{ __html: highlighted.highlightedCode }} />
        ) : (
          <code>{highlighted.code}</code>
        )}
      </pre>
    </div>
  );
}
