'use client';

import { DocsMobileBar } from '@embedpdf/docs-kit';

import { useConfig } from './config-provider';
import { DocsNav, useHasDocsNav } from './sidebar';

type Crumb = { title?: string };

/**
 * The phone-width docs bar: a breadcrumb that opens the page tree, plus the
 * section list. Both rails are hidden below `md`, so without this a reader on
 * a phone can only leave the current page through links in its prose.
 */
export function DocsMobileNav() {
  const { activePath } = useConfig() as { activePath?: Crumb[] };
  const hasNav = useHasDocsNav();

  if (!hasNav) return null;

  // "Configuration / Storage" — the last two rungs are what orient a reader;
  // the "Docs" root above them is the same on every page and only costs width.
  const label =
    (activePath ?? [])
      .map((crumb) => crumb?.title)
      .filter((title): title is string => Boolean(title))
      .slice(-2)
      .join(' / ') || 'Documentation';

  return (
    <DocsMobileBar label={label}>
      <DocsNav />
    </DocsMobileBar>
  );
}
