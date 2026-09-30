/**
 * Text-selection authoring: the bridge that turns a text selection into markup
 * or a text-edit annotation (Insert / Replace). These tools have no gesture of
 * their own — they enable the selection plugin's `text-select` gesture, and this
 * module consumes its typed events (`onCommitted` to create, `onChanged` to preview)
 * and the tool changes (a tool picked with text already selected creates too).
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
        quadsByPage[entry.page.objectNumber] = entry.segments.map((segment) => segment.quad);
      }
      annotation.previewMarkup(previewSubtype, quadsByPage, tool.preset);
    } else {
      annotation.clearMarkupPreview();
    }
  };
  selection.onChanged(sync); // drag-extend → live preview

  // A text tool turns the selection into its markup, and stays active: when
  // a selection is committed while the tool is active, and when the tool
  // becomes active while a selection is there (not mid-drag: the drag's end
  // commits it). Selecting with the pointer tool leaves the selection (copy).
  selection.onCommitted(() => {
    annotation.applyToolToSelection(interaction.getActiveToolId());
  });
  interaction.onToolChanged(() => {
    if (!selection.isGestureActive())
      annotation.applyToolToSelection(interaction.getActiveToolId());
    sync(); // entering/leaving a markup tool → restore blue / clear ghost
  });
}
