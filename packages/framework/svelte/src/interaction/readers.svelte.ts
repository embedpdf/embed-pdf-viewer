/** The interaction plugin's readers: its API, state, settings and events, and tool cursors. */
import { untrack } from 'svelte';
import type { EventHook } from '@embedpdf/core';
import { InteractionToken, interactionState } from '@embedpdf/plugin-interaction';
import type { InteractionCapability } from '@embedpdf/plugin-interaction';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import { toolCursorsOf, type ToolCursorSpec } from '@embedpdf/web';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
} from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';
import { valueOf, type MaybeGetter } from '../runtime/values.svelte';

/** The interaction API: switch tools, add your own, set their cursors. */
export function useInteraction(): InteractionCapability {
  return useCapability(InteractionToken);
}

/** Subscribe to one interaction event while the component lives: `useInteractionEvent((interaction) => interaction.onToolChanged, handler)`. */
export function useInteractionEvent<T>(
  select: (interaction: InteractionCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(InteractionToken, select, handler);
}

/**
 * The tools' state: the active tool's id and every tool you can switch to (declared once in
 * `interactionState`). Without a document there is no active tool (`null`) and no tool.
 */
export const useInteractionState = stateReader(interactionState);

/** The interaction settings (`defaultTool`, `tools`), with or without a document. */
export const useInteractionSettings = settingsReader(InteractionToken);

/**
 * Give a tool image cursors: the armed-tool indicator. The interaction plugin already decides
 * which cursor shows (hover claims over annotations and text win, page gaps show the tool's
 * `gapCursor`), so nothing chases the pointer in the DOM. Pass a function, so the cursor follows
 * what it reads (a color); `null` installs nothing. Going away restores the tool's own cursors.
 * Without a document it installs nothing until one is ready.
 */
export function useToolCursor(spec: MaybeGetter<ToolCursorSpec | null>): void {
  const interaction = useOptionalCapability(InteractionHostToken);
  // By value: a function builds a fresh object every time, and an identical one must not
  // replace the cursor.
  const key = $derived.by(() => {
    const current = valueOf(spec);
    return current ? JSON.stringify(current) : null;
  });
  $effect(() => {
    const host = interaction.current;
    if (!host || key === null) return;
    const cursorSpec = untrack(() => valueOf(spec))!;
    untrack(() => host.setToolCursor(cursorSpec.toolId, toolCursorsOf(cursorSpec.cursors)));
    return () => host.setToolCursor(cursorSpec.toolId, null);
  });
}
