import type {
  InteractionHostCapability,
  InteractionHandler,
} from '@embedpdf/plugin-interaction/contract/host';
import type { StageCapability } from './contract';

export interface ScrollHandlerOptions {
  /**
   * Let a drag over a page gap pan regardless of the active tool, and show a
   * grab cursor there, so the gutter always pans (outside a page there is
   * nothing to draw on or select). On-page behavior is untouched: the tool's
   * own gesture still owns page space. Default true.
   */
  panFallback?: boolean;
}

/**
 * Pan-the-camera as an interaction handler. Live under the built-in `pan` tool
 * (the `scroll` tag) and, with `panFallback`, under every tool, where it then
 * captures only page-gap drags (on-page downs belong to the active tool, which
 * claims them first at higher priority). It uses the sample's viewport delta,
 * so it pans over the whole viewport (pages and gaps).
 *
 * Cursors: a closed hand (`grabbing`) while dragging; an open hand (`grab`)
 * hovering a gap under a non-pan tool. The pan tool's own resting `grab` comes
 * from its `Tool.cursor`, so hovering it needs no claim here.
 */
export function createScrollHandler(
  stage: StageCapability,
  interaction: InteractionHostCapability,
  options: ScrollHandlerOptions = {},
): InteractionHandler {
  const panFallback = options.panFallback ?? true;
  let last = { x: 0, y: 0 };
  const isPanTool = (): boolean => interaction.getActiveTool().enables.has('scroll');
  return {
    id: 'stage-scroll',
    priority: 10, // below page-aware handlers (selection, annotation), which claim first
    enabledFor: (tool) => tool.enables.has('scroll') || panFallback,
    onDown: (sample) => {
      // Fallback: a non-pan tool pans only over a gap. On a page, decline so the
      // tool's own (higher-priority) handler keeps the down it already captured.
      if (!isPanTool() && sample.page) return false;
      last = sample.viewport;
      interaction.claimCursor('stage-grab', 'grabbing', 40); // closed hand while panning
      return true; // capture the drag
    },
    onMove: (sample) => {
      stage.panBy(sample.viewport.x - last.x, sample.viewport.y - last.y);
      last = sample.viewport;
    },
    onUp: () => interaction.claimCursor('stage-grab', null),
    onHover: (sample) => {
      // An open hand over a gap when a non-pan tool would fall back to pan
      // there; cleared over a page (the tool's cursor shows). The pan tool
      // skips this: its resting `grab` is the tool cursor.
      if (panFallback && !isPanTool()) {
        interaction.claimCursor('stage-pan-fallback', sample.page ? null : 'grab', 5);
      }
    },
  };
}
