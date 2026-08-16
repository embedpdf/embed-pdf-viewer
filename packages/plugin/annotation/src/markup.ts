/**
 * Text-selection authoring: the bridge that turns a TEXT SELECTION into markup
 * or a text-edit annotation (Insert / Replace). These tools have no gesture of
 * their own — they enable the selection plugin's `text-select` gesture, and this
 * module consumes its typed signals (`onCommit` to create, `onChange` to preview).
 * Selection is the producer; annotation the consumer — selection never knows
 * annotation exists. Kept out of the plugin-definition file so that stays lean.
 */
import type { InteractionCapability } from '@embedpdf/plugin-interaction';
import type { SelectionHostCapability } from '@embedpdf/plugin-selection/internal';
import type { AnnotationHostCapability } from './types';

/**
 * Wire the selection → annotation BRIDGE. The markup / caret TOOLS and their
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
    const tool = annotation.tool(interaction.activeToolId());
    const authoring = tool?.selection;
    const previewSubtype =
      authoring?.kind === 'markup'
        ? tool!.subtype
        : authoring?.kind === 'text-edit' && authoring.operation === 'replace'
          ? 'strikeout'
          : null;
    selection.setHighlightVisible(previewSubtype == null);
    if (previewSubtype && tool && selection.hasSelection()) {
      const quadsByPage: Record<number, ReturnType<typeof selection.segmentsForPage>[number]['quad'][]> =
        {};
      for (const page of selection.snapshot().pages) {
        quadsByPage[page.pon] = page.segments.map((s) => s.quad);
      }
      annotation.previewMarkup(previewSubtype, quadsByPage, tool.preset);
    } else {
      annotation.clearMarkupPreview();
    }
  };
  selection.onChange(sync); // drag-extend → live preview
  interaction.onToolChange(sync); // entering/leaving a markup tool → restore blue / clear ghost

  // On gesture-end, if a markup tool is active, turn the selection into markup.
  selection.onCommit(() => {
    const tool = annotation.tool(interaction.activeToolId());
    const authoring = tool?.selection;
    if (!tool || !authoring) return; // pointer tool → leave the selection (copy)
    const snapshot = selection.snapshot();
    if (authoring.kind === 'text-edit' && authoring.operation === 'insert') {
      if (snapshot.end) {
        annotation.createCaret(snapshot.end.pon, {
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
      for (const page of snapshot.pages) {
        const last = page.segments[page.segments.length - 1];
        if (!last) continue;
        const anchor =
          snapshot.end && snapshot.end.pon === page.pon
            ? { glyphQuad: snapshot.end.glyphQuad, advance: snapshot.end.advance }
            : { glyphQuad: last.quad, advance: last.advance };
        annotation.createReplaceText(
          page.pon,
          page.segments.map((s) => s.quad),
          anchor,
          tool.preset,
        );
      }
      selection.clear();
      return;
    }
    for (const page of snapshot.pages) {
      annotation.createMarkup(
        tool.subtype,
        page.pon,
        page.segments.map((s) => s.quad),
        tool.preset,
      );
    }
    selection.clear(); // fires onChange → preview clears; blue stays suppressed (markup tool still active)
  });
}
