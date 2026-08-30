import { describe, expect, it } from 'vitest';
import type { PluginContext } from '@embedpdf/core';

import { createSearchCapability } from './capability';
import type { SearchAction, SearchState } from './types';

/** Only what `canSearch` reads — the twin is a pure security composition. */
const makeCtx = (granted: readonly string[] | null) =>
  ({
    doc: granted === null ? null : { security: { allows: (cap: string) => granted.includes(cap) } },
    getState: () => ({}) as SearchState,
    dispatch: () => {},
    document: () => null,
    tryGet: () => null,
  }) as unknown as PluginContext<SearchState, SearchAction>;

describe('the twin law (permissions.md) — canSearch', () => {
  it('no mode (and rects) asks about finding at all: doc.text.search', () => {
    const cap = createSearchCapability(makeCtx(['doc.text.search']));
    expect(cap.canSearch()).toBe(true);
    expect(cap.canSearch('rects')).toBe(true);
    // The session degrades 'full' → 'rects' itself, so plain canSearch()
    // stays true without copy — but snippet UI must ask for 'full'.
    expect(cap.canSearch('full')).toBe(false);
  });

  it("'full' also requires doc.text.copy — a snippet reproduces text", () => {
    const cap = createSearchCapability(makeCtx(['doc.text.search', 'doc.text.copy']));
    expect(cap.canSearch('full')).toBe(true);
  });

  it('copy without search finds nothing; no document answers false', () => {
    expect(createSearchCapability(makeCtx(['doc.text.copy'])).canSearch()).toBe(false);
    expect(createSearchCapability(makeCtx(null)).canSearch()).toBe(false);
  });
});
