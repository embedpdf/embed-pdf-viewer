/**
 * The actions' readers: the API, the settings, the events, and the UI adapter a component
 * installs for as long as it lives.
 */
import { untrack } from 'svelte';
import type { EventHook } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions';
import type { ActionsCapability, ActionUiAdapter } from '@embedpdf/plugin-actions';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { createDefaultActionsUiAdapter } from '@embedpdf/web';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
} from '../runtime/readers.svelte';
import { settingsReader } from '../runtime/state.svelte';
import { valueOf, type MaybeGetter } from '../runtime/values.svelte';

/**
 * The actions API (`execute`, `executeNamed`, `dispatch`, the settings) of the nearest
 * `<DocumentScope>`'s document, else the active one. Outside a ready document the settings calls
 * work and every other method throws `not-ready`.
 */
export function useActions(): ActionsCapability {
  return useCapability(ActionsToken);
}

/** The actions settings (`policy`, `triggers`, `openSequence`, `javascript`), with or without a document. Takes a selector. */
export const useActionsSettings = settingsReader(ActionsToken);

/** Subscribe to one actions event while the component lives: `useActionsEvent((actions) => actions.onExecuted, handler)`. */
export function useActionsEvent<T>(
  select: (actions: ActionsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(ActionsToken, select, handler);
}

/** Your own handlers for any of the adapter's effects: `openUri`, `print`, `alert`, `gotoPage`. */
export type ActionsUiHandlers = Partial<ActionUiAdapter>;

/**
 * Install the UI adapter for the action dispatcher of the document in scope, for as long as the
 * component lives. The defaults (which effects may show themselves for which start, websites
 * opened through `sanitizeExternalUri`, the browser's print dialog and alert) are
 * `@embedpdf/web`'s `createDefaultActionsUiAdapter`, written once for every framework; this is
 * the Svelte glue.
 *
 * `handlers` replace any of the defaults. They are read each time an action needs them, so a
 * handler that reads `$state` sees its current value, and handlers passed as a function
 * (`() => handlers`) can be swapped without installing the adapter again. The adapter is
 * installed again only when the document or its Stage changes. The `doc.print` permission is
 * checked by the plugin, before any handler runs.
 */
export function useActionsUiAdapter(handlers?: MaybeGetter<ActionsUiHandlers | undefined>): void {
  const actions = useOptionalCapability(ActionsToken);
  const stage = useOptionalCapability(StageToken);
  $effect(() => {
    const current = actions.current;
    const view = stage.current;
    if (!current) return;
    return untrack(() => {
      const adapter: ActionUiAdapter = createDefaultActionsUiAdapter({
        overrides: () => valueOf(handlers),
        goToPage: (page) => view?.goToPage(page),
      });
      return current.setUiAdapter(adapter);
    });
  });
}
