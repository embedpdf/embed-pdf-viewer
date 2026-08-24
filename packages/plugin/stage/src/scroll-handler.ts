import type { InteractionCapability, InteractionHandler } from '@embedpdf/plugin-interaction';
import type { StageCapability } from './types';

export interface ScrollHandlerOptions {
  /**
   * Let a drag over a page GAP pan regardless of the active tool — and show a grab
   * cursor there — so the gutter always pans (v2 parity, and the natural feel:
   * outside a page there's nothing to draw/select on). On-page behaviour is
   * untouched; the tool's own gesture still owns page space. Default true.
   */
  panFallback?: boolean;
}

/**
 * Pan-the-camera as an interaction handler. Live under the built-in `pan` tool
 * (the `scroll` tag) and — with `panFallback` — under every tool, where it then
 * captures ONLY page-gap drags (on-page downs belong to the active tool, which
 * claims them first at higher priority). It uses the sample's viewport delta, so
 * it pans over the whole viewport (pages and gaps).
 *
 * Cursor feel: a closed hand (`grabbing`) while dragging; an open hand (`grab`)
 * hovering a gap under a non-pan tool. The pan tool's own resting `grab` comes
 * from its `Tool.cursor`, so hovering it needs no claim here.
 */
export function createScrollHandler(
  stage: StageCapability,
  interaction: InteractionCapability,
  options: ScrollHandlerOptions = {},
): InteractionHandler {
  const panFallback = options.panFallback ?? true;
  let last = { x: 0, y: 0 };
  const isPanTool = (): boolean => interaction.activeTool().enables.has('scroll');
  return {
    id: 'stage-scroll',
    priority: 10, // below page-aware handlers (selection/annotation) — they claim first
    enabledFor: (tool) => tool.enables.has('scroll') || panFallback,
    onDown: (s) => {
      // Fallback: a non-pan tool pans only over a gap. On a page, decline so the
      // tool's own (higher-priority) handler keeps the down it already captured.
      if (!isPanTool() && s.page) return false;
      last = s.viewport;
      interaction.setCursor('stage-grab', 'grabbing', 40); // closed hand while panning
      return true; // capture the drag
    },
    onMove: (s) => {
      stage.panBy(s.viewport.x - last.x, s.viewport.y - last.y);
      last = s.viewport;
    },
    onUp: () => interaction.setCursor('stage-grab', null),
    onHover: (s) => {
      // Open hand over a gap when a non-pan tool would fall back to pan there;
      // cleared over a page (the tool's cursor shows). The pan tool skips this —
      // its resting `grab` is the tool cursor.
      if (panFallback && !isPanTool()) {
        interaction.setCursor('stage-pan-fallback', s.page ? null : 'grab', 5);
      }
    },
  };
}
