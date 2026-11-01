import type {
  InteractionHostCapability,
  InteractionHandler,
} from '@embedpdf/plugin-interaction/contract/host';
import type { StageHostCapability } from './host-contract';

/**
 * The `zoom` tool as an interaction handler: live under the tool's `zoom-box`
 * tag, over the pages and the space between them. It forwards the pointer in
 * viewport px to the stage's zoom drag, which decides what a box or a click
 * zooms to. A sample from another surface (a `PageView` stamps no lens) is in
 * another element's px, so the handler takes only its own lens's presses.
 *
 * Cursors: the tool's own `zoom-in`, and `zoom-out` while Alt (Option) is
 * held, which turns a click into a step out.
 */
export function createZoomDragHandler(
  stage: StageHostCapability,
  interaction: InteractionHostCapability,
): InteractionHandler {
  return {
    id: 'stage-zoom-drag',
    priority: 10, // the stage's own band, as the scroll handler
    enabledFor: (tool) => tool.enables.has('zoom-box'),
    onDown: (sample) => {
      if (sample.source !== stage.getLensId()) return false;
      stage.beginZoomDrag(sample.viewport);
      return true;
    },
    onMove: (sample) => stage.moveZoomDrag(sample.viewport),
    onUp: (sample) => stage.endZoomDrag({ zoomOut: sample.modifiers.alt }),
    onCancel: () => stage.cancelZoomDrag(),
    onHover: (sample) =>
      interaction.claimCursor('stage-zoom-out', sample.modifiers.alt ? 'zoom-out' : null),
  };
}
