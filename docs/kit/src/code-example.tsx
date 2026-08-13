'use client';

import { Children, type ReactNode } from 'react';

import { CodeExampleCard, type ExampleFile } from './code-example-card';

/**
 * The docs-pipeline `<CodeExample>` element (rehype injects `files` with
 * highlighted code; `<Example>` rewrites arrive here too). A thin
 * normalising wrapper over {@link CodeExampleCard}: legacy single-`code`
 * usage becomes a one-file list, and children — when present — render as
 * the live preview. No children, no dead preview box.
 */
export interface CodeExampleProps {
  children?: ReactNode;
  files?: ExampleFile[];
  code?: string;
  language?: string;
  highlightedCode?: string;
  githubUrl?: string;
  /** Accepted for compatibility; the card's surface is standardised. */
  framed?: boolean;
  background?: 'dots' | 'solid' | 'none';
}

export function CodeExample({
  children,
  files = [],
  code,
  language = 'tsx',
  highlightedCode,
  githubUrl,
}: CodeExampleProps) {
  const allFiles: ExampleFile[] =
    files.length > 0
      ? files
      : code
        ? [{ filename: 'Example.tsx', code, language, highlightedCode, githubUrl }]
        : [];

  const hasDemo = Children.count(children) > 0;

  return (
    <CodeExampleCard files={allFiles} demo={hasDemo ? () => children : undefined} />
  );
}

export default CodeExample;
