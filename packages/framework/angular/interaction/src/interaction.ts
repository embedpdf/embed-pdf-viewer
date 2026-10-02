/**
 * The interaction plugin's service and features: which tool the pointer works with, the tools
 * you can switch to, and their cursors.
 *
 *   withInteraction(options)          the plugin, for provideEmbedPdf()
 *   withFeedback({ provider })        haptics for the moments that call for them
 *   inject(EpdfInteraction)           `activeToolId()`, `activateTool()`, `toolChanged$`, …
 */
import { computed, effect, Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  feedbackPlugin,
  interactionPlugin,
  interactionState,
  InteractionToken,
  type FeedbackPluginOptions,
  type InteractionConfig,
} from '@embedpdf/plugin-interaction';
import { toolCursorsOf, type ToolCursorSpec } from '@embedpdf/web';

/** A tool's cursors (`ToolCursorSpec`) and one of them (`ToolCursorImage`), from `@embedpdf/web`. */
export type { ToolCursorImage, ToolCursorSpec } from '@embedpdf/web';

/** The same spec, compared by value: a spec rebuilt with the same content changes nothing. */
const sameSpec = (left: ToolCursorSpec | null, right: ToolCursorSpec | null) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * The tools: `activeToolId()` and `tools()` as signals, `activateTool()`, `pushTool()` and
 * `popTool()` to switch, `registerTool()` for a tool of your own, `toolChanged$` and the
 * gesture streams, and the settings. Without a document there is no active tool.
 */
@Injectable({ providedIn: 'root' })
export class EpdfInteraction extends pluginService({
  name: 'EpdfInteraction',
  feature: 'withInteraction()',
  token: InteractionToken,
  state: interactionState,
  methods: [
    'getActiveTool',
    'getActiveToolId',
    'getDefaultToolId',
    'listTools',
    'getTool',
    'hasTool',
    'activateTool',
    'activateDefaultTool',
    'pushTool',
    'popTool',
    'setToolCursor',
    'registerTool',
  ],
  events: ['onToolChanged', 'onGestureStarted', 'onGestureEnded', 'onGestureCancelled'],
}) {
  /**
   * Give a tool cursors of your own, such as a pen in the ink color, for as long as the caller
   * lives: the tool gets its own cursors back when the component or directive that called it
   * goes. `spec` is read again when the signals it reads change, so the cursor follows a color
   * setting. `null` puts nothing in place. Call it in an injection context (a constructor or a
   * field initializer).
   *
   * The cursor is the one pixel that follows the pointer with no delay, so it shows the armed
   * tool better than anything drawn under the pointer could.
   */
  overrideCursor(spec: () => ToolCursorSpec | null): void {
    const current = computed(spec, { equal: sameSpec });
    effect((onCleanup) => {
      const cursorSpec = current();
      const interaction = this.binding.capability();
      if (!cursorSpec || !interaction) return;
      interaction.setToolCursor(cursorSpec.toolId, toolCursorsOf(cursorSpec.cursors));
      onCleanup(() => interaction.setToolCursor(cursorSpec.toolId, null));
    });
  }
}

/** The interaction plugin: the tools and the pointer. `withInteraction({ defaultTool: 'pan' })`. */
export function withInteraction(options?: InteractionConfig): EmbedPdfFeature {
  return { plugins: [interactionPlugin(options)], services: [EpdfInteraction] };
}

/**
 * Haptics: one provider for the whole viewer, which plugins call at their moments (a word
 * selected on a long press). `withFeedback({ provider: vibrationFeedback })`.
 */
export function withFeedback(options?: FeedbackPluginOptions): EmbedPdfFeature {
  return { plugins: [feedbackPlugin(options)] };
}
