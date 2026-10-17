/**
 * @embedpdf/vue/interaction: the Vue surface of `@embedpdf/plugin-interaction`.
 * `<PagePointerSource>` is a page's one pointer listener; the composables switch
 * tools, read the tools' state and settings, follow the hub's events, and give
 * a tool its own cursor.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-interaction';
// The browser helpers live in @embedpdf/web (the plugin is DOM-free); they are
// re-exported here so app code has one import for the feature.
export { createClickCounter, svgCursor, vibrationFeedback, wkFeedback } from '@embedpdf/web';
export type { SvgCursorOptions, ToolCursorImage, ToolCursorSpec } from '@embedpdf/web';
import { computed, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import { InteractionToken, interactionState } from '@embedpdf/plugin-interaction';
import type { InteractionCapability } from '@embedpdf/plugin-interaction';
import type { EventHook } from '@embedpdf/core';
import { toolCursorsOf } from '@embedpdf/web';
import type { ToolCursorSpec } from '@embedpdf/web';
import { useCapability, useCapabilityEvent, useOptionalCapability } from './runtime/capabilities';
import { settingsComposable, stateComposable } from './state';

export { default as PagePointerSource } from './interaction/PagePointerSource.vue';

/** The interaction API: switch tools, add your own, set their cursors. The object never changes. */
export function useInteraction(): InteractionCapability {
  return useCapability(InteractionToken);
}

/** Subscribe to one interaction event while the component lives: `useInteractionEvent((interaction) => interaction.onGestureStarted, handler)`. */
export function useInteractionEvent<Event>(
  select: (interaction: InteractionCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(InteractionToken, select, handler);
}

/**
 * The tools' state as refs: the active tool's id and every tool you can
 * switch to (the page's State table, declared once in `interactionState`).
 * With a selector, one ref. Without a document there is no active tool
 * (`null`) and no tool.
 */
export const useInteractionState = stateComposable(interactionState);

/** The interaction settings (`defaultTool`, `tools`), with or without a document, as refs. Takes a selector. */
export const useInteractionSettings = settingsComposable(InteractionToken);

/**
 * Give a tool image cursors: the armed-tool indicator. The hub already decides
 * which cursor shows (hover claims over annotations and text win, the gaps
 * between pages show the tool's `gapCursor`), so nothing chases the pointer in
 * the DOM. Pass a getter to follow your values: a new spec rebuilds the cursor
 * (a color picked in your toolbar), and the component's unmount restores the
 * tool's own cursors. `null` installs nothing; without a document it installs
 * nothing until one is ready.
 */
export function useToolCursor(spec: MaybeRefOrGetter<ToolCursorSpec | null>): void {
  const interaction = useOptionalCapability(InteractionHostToken);
  // By value: a getter builds a new object each time, and an equal one must
  // not rebuild the cursor.
  const key = computed(() => {
    const current = toValue(spec);
    return current ? JSON.stringify(current) : null;
  });
  watch(
    [interaction, key],
    ([hub, json], _previous, onCleanup) => {
      if (!hub || !json) return;
      const { toolId, cursors } = JSON.parse(json) as ToolCursorSpec;
      hub.setToolCursor(toolId, toolCursorsOf(cursors));
      onCleanup(() => hub.setToolCursor(toolId, null));
    },
    { immediate: true },
  );
}
