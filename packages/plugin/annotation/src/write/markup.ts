import { PluginError, pageRefsEqual, type OperationOptions } from '@embedpdf/core';
import type { KindName, TextEndAnchor, Quad, UpdateResult } from '@embedpdf/core-annotation';
import type { Annotation, PageRef } from '@embedpdf/engine-core/runtime';
import {
  SelectionToken as SelectionPublicToken,
  type SelectionSnapshot,
} from '@embedpdf/plugin-selection/contract';

import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { Commit } from '../services/store';
import type { ResolvedTool } from '../tools/definitions';
import { createdRefOf } from './outcomes';

/**
 * What a text tool makes of the text selection: markup (highlight, underline,
 * strikeout, squiggly, a text redaction) over the selected text, a caret at
 * its end (insert text), or a caret and strikeout pair (replace text).
 */
type SelectionMarkup =
  | { kind: 'markup'; subtype: KindName }
  | { kind: 'insert' }
  | { kind: 'replace' };

/** What the tool makes of a text selection; `null` for a tool that makes nothing of one. */
const selectionMarkupOf = (tool: ResolvedTool): SelectionMarkup | null => {
  const authoring = tool.selection;
  if (!authoring) return null;
  if (authoring.kind === 'markup') return { kind: 'markup', subtype: tool.subtype };
  return { kind: authoring.operation };
};

/**
 * Text markup, carets and replace-text pairs, created over text and shown at
 * once: the text tools' path (`applyToolToSelection`, when a selection meets
 * a text tool) and the programmatic `createFromSelection`.
 */
export function createMarkupWrites(
  ctx: Pick<AnnotationContext, 'tryGet' | 'assertAllowed' | 'cancellable'>,
  {
    store,
    authority,
    tools,
    afterCreate,
  }: Pick<AnnotationServices, 'store' | 'authority' | 'tools' | 'afterCreate'>,
  annotations: Pick<AnnotationReads, 'get'>,
) {
  /** How a create's result shows: a tool's `afterCreate`, or code's (nothing selected changes). */
  type Adjust = (result: UpdateResult) => UpdateResult;

  // A markup tool's `/F` seed rides along (the preset is the tool id).
  const commitMarkup = (
    subtype: KindName,
    page: PageRef,
    quads: Quad[],
    preset?: string,
    adjust?: Adjust,
  ) =>
    store.commit(
      {
        type: 'createMarkup',
        subtype,
        page,
        quads,
        preset,
        flags: preset ? tools.get(preset)?.flags : undefined,
      },
      { adjust },
    );
  const commitCaret = (page: PageRef, anchor: TextEndAnchor, adjust?: Adjust) =>
    store.commit({ type: 'createCaret', page, anchor }, { adjust });
  const commitReplaceText = (
    page: PageRef,
    quads: Quad[],
    anchor: TextEndAnchor,
    preset?: string,
    adjust?: Adjust,
  ) => store.commit({ type: 'createReplaceText', page, quads, anchor, preset }, { adjust });

  /**
   * The selection as `markup`: one annotation per page, over the page's
   * selected text; an insert's caret at the selection's end. `/IRT` ties are
   * page-local, so a selection across pages makes one self-contained Caret +
   * StrikeOut pair per page: the true glyph-cell anchor exists only on the
   * selection's end page, other pages anchor at their last segment's
   * trailing edge. The caller has checked the create authority.
   */
  const markupFromSelection = (
    markup: SelectionMarkup,
    snapshot: SelectionSnapshot,
    preset: string | undefined,
    adjust: Adjust,
  ): Commit[] => {
    const end = snapshot.end;
    if (markup.kind === 'insert') {
      return end
        ? [commitCaret(end.page, { glyphQuad: end.glyphQuad, advance: end.advance }, adjust)]
        : [];
    }
    const commits: Commit[] = [];
    for (const entry of snapshot.pages) {
      const last = entry.segments[entry.segments.length - 1];
      if (!last) continue;
      const quads = entry.segments.map((segment) => segment.quad);
      if (markup.kind === 'markup') {
        commits.push(commitMarkup(markup.subtype, entry.page, quads, preset, adjust));
        continue;
      }
      const anchor =
        end && pageRefsEqual(end.page, entry.page)
          ? { glyphQuad: end.glyphQuad, advance: end.advance }
          : { glyphQuad: last.quad, advance: last.advance };
      commits.push(commitReplaceText(entry.page, quads, anchor, preset, adjust));
    }
    return commits;
  };

  const api = {
    createMarkup: (subtype: KindName, page: PageRef, quads: Quad[], preset?: string) => {
      // Optimistic create — the same self-refusal `createPointer` has.
      if (!authority.canCreate()) return;
      commitMarkup(subtype, page, quads, preset);
    },
    createCaret: (page: PageRef, anchor: TextEndAnchor) => {
      if (!authority.canCreate()) return;
      commitCaret(page, anchor);
    },
    createReplaceText: (page: PageRef, quads: Quad[], anchor: TextEndAnchor, preset?: string) => {
      if (!authority.canCreate()) return;
      commitReplaceText(page, quads, anchor, preset);
    },
    /**
     * Turn the text selection into what the tool makes of it, then clear the
     * selection. Nothing, and `false`, for a tool that makes nothing of a
     * selection, without create authority, or without a selection.
     */
    applyToolToSelection: (toolId: string): boolean => {
      const tool = tools.get(toolId);
      const markup = tool && selectionMarkupOf(tool);
      if (!tool || !markup || !authority.canCreate()) return false;
      const selection = ctx.tryGet(SelectionPublicToken);
      if (!selection || !selection.hasSelection()) return false;
      const commits = markupFromSelection(
        markup,
        selection.getSnapshot(),
        tool.preset,
        afterCreate.shape(tool.id),
      );
      selection.clear();
      for (const commit of commits) afterCreate.done(tool.id, commit);
      return true;
    },
    previewMarkup: (subtype: KindName, quadsByPage: Record<number, Quad[]>, preset?: string) => {
      store.commit({ type: 'setMarkupPreview', subtype, quadsByPage, preset });
    },
    clearMarkupPreview: () => {
      store.commit({ type: 'clearMarkupPreview' });
    },
    createFromSelection: async (
      toolId: string,
      options: OperationOptions & { clear?: boolean } = {},
    ): Promise<{ annotations: readonly Annotation[] }> => {
      ctx.assertAllowed('annotations:create', 'annotation.createFromSelection');
      const tool = tools.get(toolId);
      const markup = tool && selectionMarkupOf(tool);
      if (!tool || !markup) {
        throw new PluginError(
          'not-found',
          'annotation',
          `no tool '${toolId}' that makes something of selected text`,
        );
      }
      const selection = ctx.tryGet(SelectionPublicToken);
      if (!selection || !selection.hasSelection()) return { annotations: [] };
      // Code never changes the annotation selection: what the core selects goes.
      const before = store.model();
      const keepSelection: Adjust = (result) => ({
        ...result,
        session: { ...result.session, selected: before.selected, editing: before.editing },
      });
      const commits = markupFromSelection(
        markup,
        selection.getSnapshot(),
        tool.preset,
        keepSelection,
      );
      if (options.clear !== false) selection.clear();
      const refs = await ctx.cancellable(
        options.signal,
        Promise.all(
          commits.filter((commit) => commit.effects.length).map((commit) => createdRefOf(commit)),
        ),
      );
      return {
        annotations: refs
          .map((ref) => annotations.get(ref))
          .filter((annotation): annotation is Annotation => annotation !== null),
      };
    },
  };

  return { api };
}
