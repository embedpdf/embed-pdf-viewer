/**
 * Text-selection authoring: the bridge that turns a text selection into markup
 * or a text-edit annotation (Insert / Replace). These tools have no gesture of
 * their own — they enable the selection plugin's `text-select` gesture, and this
 * module consumes its typed events (`onCommitted` to create, `onChanged` to preview).
 * Selection is the producer; annotation the consumer — selection never knows
 * annotation exists. Kept out of the plugin-definition file so that stays lean.
 */
import type { InteractionCapability } from '@embedpdf/plugin-interaction/contract';
import type { SelectionHostCapability } from '@embedpdf/plugin-selection/contract/host';

import type { AnnotationHostCapability } from '../host-contract';

/**
 * Wire the selection → annotation bridge. The markup / caret tools and their
 * defaults are registered by the plugin `init` from the tool registry; this
 * function only consumes the selection plugin's typed signals — so call it from
 * `init` only when a selection plugin is present. Selection is the producer,
 * annotation the consumer; selection never knows annotation exists.
 */
export function wireMarkup(
  annotation: AnnotationHostCapability,
  selection: SelectionHostCapability,
  interaction: InteractionCapability,
): void {
  // Keep the live preview + the selection's own visual in sync with (active tool,
  // selection). While a markup tool is active the blue highlight is suppressed and
  // the in-progress selection renders as a markup ghost instead.
  const sync = () => {
    const tool = annotation.getResolvedTool(interaction.getActiveToolId());
    const authoring = tool?.selection;
    const previewSubtype =
      authoring?.kind === 'markup'
        ? tool!.subtype
        : authoring?.kind === 'text-edit' && authoring.operation === 'replace'
          ? 'strikeout'
          : null;
    selection.setHighlightVisible(previewSubtype == null);
    if (previewSubtype && tool && selection.hasSelection()) {
      const quadsByPage: Record<
        number,
        ReturnType<typeof selection.listSegments>[number]['quad'][]
      > = {};
      for (const entry of selection.getSnapshot().pages) {
        quadsByPage[entry.page.pageObjectNumber] = entry.segments.map((segment) => segment.quad);
      }
      annotation.previewMarkup(previewSubtype, quadsByPage, tool.preset);
    } else {
      annotation.clearMarkupPreview();
    }
  };
  selection.onChanged(sync); // drag-extend → live preview
  interaction.onToolChanged(sync); // entering/leaving a markup tool → restore blue / clear ghost

  // On gesture-end, if a markup tool is active, turn the selection into markup.
  selection.onCommitted(() => {
    const tool = annotation.getResolvedTool(interaction.getActiveToolId());
    const authoring = tool?.selection;
    if (!tool || !authoring) return; // pointer tool → leave the selection (copy)
    const snapshot = selection.getSnapshot();
    if (authoring.kind === 'text-edit' && authoring.operation === 'insert') {
      if (snapshot.end) {
        annotation.createCaret(snapshot.end.page, {
          glyphQuad: snapshot.end.glyphQuad,
          advance: snapshot.end.advance,
        });
      }
      selection.clear();
      return;
    }
    if (authoring.kind === 'text-edit' && authoring.operation === 'replace') {
      // `/IRT` relationships are page-local, so a cross-page selection becomes
      // one self-contained Caret + StrikeOut pair per page. The true glyph-cell
      // anchor exists only on the selection's end page; other pages anchor at
      // their last segment's trailing edge.
      for (const entry of snapshot.pages) {
        const last = entry.segments[entry.segments.length - 1];
        if (!last) continue;
        const anchor =
          snapshot.end && snapshot.end.page.pageObjectNumber === entry.page.pageObjectNumber
            ? { glyphQuad: snapshot.end.glyphQuad, advance: snapshot.end.advance }
            : { glyphQuad: last.quad, advance: last.advance };
        annotation.createReplaceText(
          entry.page,
          entry.segments.map((segment) => segment.quad),
          anchor,
          tool.preset,
        );
      }
      selection.clear();
      return;
    }
    for (const entry of snapshot.pages) {
      annotation.createMarkup(
        tool.subtype,
        entry.page,
        entry.segments.map((segment) => segment.quad),
        tool.preset,
      );
    }
    selection.clear(); // fires onChanged → preview clears; blue stays suppressed (markup tool still active)
  });
}
