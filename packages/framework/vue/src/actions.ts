/**
 * @embedpdf/vue/actions: the Vue view of `@embedpdf/plugin-actions`, the
 * action engine's UI port.
 *
 * The plugin has no DOM: opening a website, printing and showing an alert are
 * this layer's job. `useActionsUiAdapter()` installs the browser's defaults
 * (the same sanitizer and `window.open` the link layer uses; print is the
 * browser's dialog), and you can replace any of them. Without it, actions
 * routed to the adapter (a website, a print) report a `no-adapter` diagnostic
 * instead of running.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-actions';
import { toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { ActionsToken } from '@embedpdf/plugin-actions';
import type { ActionsCapability, ActionUiAdapter } from '@embedpdf/plugin-actions';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { EventHook } from '@embedpdf/core';
import { createDefaultActionsUiAdapter } from '@embedpdf/web';
import { useCapability, useCapabilityEvent, useOptionalCapability } from './runtime/capabilities';
import { settingsComposable } from './state';

/**
 * The actions API (`execute`, `executeNamed`, `dispatch`, the settings) of the
 * nearest `<DocumentScope>`'s document, else the active one. The object never
 * changes; outside a document the settings calls work and every other method
 * throws `not-ready`.
 */
export function useActions(): ActionsCapability {
  return useCapability(ActionsToken);
}

/** The actions settings (`policy`, `triggers`, `openSequence`, `javascript`), with or without a document, as refs. Takes a selector. */
export const useActionsSettings = settingsComposable(ActionsToken);

/** Subscribe to one actions event while the component lives: `useActionsEvent((actions) => actions.onExecuted, handler)`. */
export function useActionsEvent<Event>(
  select: (actions: ActionsCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(ActionsToken, select, handler);
}

/** Your own handlers for any of the adapter's effects: `openUri`, `print`, `alert`, `gotoPage`. */
export type ActionsUiHandlers = Partial<ActionUiAdapter>;

/**
 * Install the UI adapter for the action dispatcher of the document in scope,
 * for as long as the component lives. The defaults (which effects may show
 * themselves for which start, websites opened through `sanitizeExternalUri`,
 * the browser's print dialog and alert) are `@embedpdf/web`'s
 * `createDefaultActionsUiAdapter`, written once for every framework; this is
 * the Vue glue. `handlers` replace any of them, and can be a ref or a getter:
 * they are read each time an action needs them, so changing them never
 * reinstalls the adapter. The adapter is installed again only when the
 * document or its Stage changes. The `doc.print` permission is checked by the
 * plugin, before any handler runs.
 */
export function useActionsUiAdapter(
  handlers?: MaybeRefOrGetter<ActionsUiHandlers | undefined>,
): void {
  const actions = useOptionalCapability(ActionsToken);
  const stage = useOptionalCapability(StageToken);
  // `sync`: installed in the same change that made the capability resolvable,
  // so no action between that change and the next render misses it.
  watch(
    [actions, stage],
    ([current, view], _previous, onCleanup) => {
      if (!current) return;
      const adapter: ActionUiAdapter = createDefaultActionsUiAdapter({
        overrides: () => toValue(handlers),
        goToPage: (page) => view?.goToPage(page),
      });
      onCleanup(current.setUiAdapter(adapter));
    },
    { immediate: true, flush: 'sync' },
  );
}
