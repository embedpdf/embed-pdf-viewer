'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

// eslint-disable-next-line import/no-unresolved — sibling plain-ESM module, typed by its .d.mts
import {
  FRAMEWORK_LABELS,
  FRAMEWORK_WORDS,
  frameworkFromPath,
  frameworkHref,
  frameworkName,
  stateIntroParts,
  type Framework as FrameworkKey,
  type NameContext,
} from '../mdx/frameworks.mjs';

/**
 * The headless docs, written for each framework (docs/conventions/docs-architecture.md). The
 * URL says which framework a page is for; these components show that framework's names and
 * words. The rules are in `../mdx/frameworks.mjs`, shared with the Markdown export.
 */

/** The framework this page is for, from the URL. React on pages without one. */
export function useDocsFramework(): FrameworkKey {
  return frameworkFromPath(usePathname() ?? '');
}

/** An inline code span, as the reader's framework names it (`useSearch()` → `inject(EpdfSearch)`). */
export function FwCode({ value, context }: { value: string; context?: NameContext }) {
  return <code>{frameworkName(value, useDocsFramework(), context)}</code>;
}

/** One framework group's version of a code block (`remarkFrameworkNames` splits blocks this way). */
export function FwVariant({ frameworks, children }: { frameworks: string; children: ReactNode }) {
  return frameworks.split(' ').includes(useDocsFramework()) ? <>{children}</> : null;
}

/** `<Framework />`: React, Vue, Svelte or Angular. */
export function Framework() {
  return <>{FRAMEWORK_LABELS[useDocsFramework()]}</>;
}

/** `<Word of="hook" />`: a word that differs per framework (hook, composable, function, service). */
export function Word({ of }: { of: keyof typeof FRAMEWORK_WORDS }) {
  return <>{FRAMEWORK_WORDS[of][useDocsFramework()]}</>;
}

/**
 * `<StateIntro hook="useSearchState()" />`: the sentence that opens every `## State` section, in
 * the reader's framework's terms. Inline content: each site wraps it in its own paragraph.
 */
export function StateIntroText({ hook }: { hook: string }) {
  return (
    <>
      {stateIntroParts(hook, useDocsFramework()).map((part, index) =>
        part.code ? <code key={index}>{part.text}</code> : part.text,
      )}
    </>
  );
}

/** A docs link that keeps the reader's framework (`/docs/viewer` → `/docs/viewer/vue`). */
export function FrameworkLink({ href = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <Link href={frameworkHref(href, useDocsFramework())} {...props} />;
}
