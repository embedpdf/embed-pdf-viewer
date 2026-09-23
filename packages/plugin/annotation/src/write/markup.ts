import { pageRefsEqual } from '@embedpdf/core';
import type { Subtype, TextEndAnchor, TextQuad } from '@embedpdf/core-annotation';
import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';
import { SelectionToken as SelectionPublicToken } from '@embedpdf/plugin-selection/contract';

import type { MarkupSubtype } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import { createdRefOf } from './outcomes';

/**
 * Text markup, carets and replace-text pairs: the selection plugin's commit
 * path (creates over text quads, shown at once) and the programmatic
 * `createFromSelection`.
 */
export function createMarkupWrites(
  ctx: Pick<AnnotationContext, 'tryGet'>,
  { store, authority, tools }: Pick<AnnotationServices, 'store' | 'authority' | 'tools'>,
) {
  const api = {
    createMarkup: (subtype: Subtype, page: PageRef, quads: TextQuad[], preset?: string) => {
      // Optimistic create — the same self-refusal `createPointer` has.
      if (!authority.canCreate()) return;
      // A markup tool's `/F` seed rides along (the preset is the tool id).
      store.commit({
        type: 'createMarkup',
        subtype,
        page,
        quads,
        preset,
        flags: preset ? tools.get(preset)?.flags : undefined,
      });
    },
    createCaret: (page: PageRef, anchor: TextEndAnchor) => {
      if (!authority.canCreate()) return;
      store.commit({ type: 'createCaret', page, anchor });
    },
    createReplaceText: (
      page: PageRef,
      quads: TextQuad[],
      anchor: TextEndAnchor,
      preset?: string,
    ) => {
      if (!authority.canCreate()) return;
      store.commit({ type: 'createReplaceText', page, quads, anchor, preset });
    },
    previewMarkup: (subtype: Subtype, quadsByPage: Record<number, TextQuad[]>, preset?: string) => {
      store.commit({ type: 'setMarkupPreview', subtype, quadsByPage, preset });
    },
    clearMarkupPreview: () => {
      store.commit({ type: 'clearMarkupPreview' });
    },
    createFromSelection: async (
      subtype: MarkupSubtype | 'insert-text' | 'replace-text' | 'redact',
      options?: { preset?: string; clear?: boolean },
    ): Promise<readonly AnnotationRef[]> => {
      authority.assertCreate();
      const selection = ctx.tryGet(SelectionPublicToken);
      if (!selection || !selection.hasSelection()) return [];
      const snapshot = selection.getSnapshot();
      const preset = options?.preset;
      const pending: Promise<AnnotationRef>[] = [];
      if (subtype === 'insert-text') {
        if (snapshot.end) {
          const commit = store.commit({
            type: 'createCaret',
            page: snapshot.end.page,
            anchor: { glyphQuad: snapshot.end.glyphQuad, advance: snapshot.end.advance },
          });
          pending.push(createdRefOf(commit));
        }
      } else {
        for (const entry of snapshot.pages) {
          if (!entry.segments.length) continue;
          const quads = entry.segments.map((segment) => segment.quad);
          if (subtype === 'replace-text') {
            const last = entry.segments[entry.segments.length - 1]!;
            const anchor =
              snapshot.end && pageRefsEqual(snapshot.end.page, entry.page)
                ? { glyphQuad: snapshot.end.glyphQuad, advance: snapshot.end.advance }
                : { glyphQuad: last.quad, advance: last.advance };
            const commit = store.commit({
              type: 'createReplaceText',
              page: entry.page,
              quads,
              anchor,
              preset,
            });
            pending.push(createdRefOf(commit));
          } else {
            const commit = store.commit({
              type: 'createMarkup',
              subtype,
              page: entry.page,
              quads,
              preset,
              flags: preset ? tools.get(preset)?.flags : undefined,
            });
            if (commit.effects.length) pending.push(createdRefOf(commit));
          }
        }
      }
      if (options?.clear !== false) selection.clear();
      return Promise.all(pending);
    },
  };

  return { api };
}
