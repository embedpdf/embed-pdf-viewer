/**
 * The React view of @embedpdf/plugin-actions — the action engine's UI port.
 *
 * The plugin is DOM-free; opening tabs and printing are this layer's job.
 * `useActionsUiAdapter()` installs the browser-default adapter (the same
 * sanitizer + window.open the link layer uses; print = the browser dialog),
 * overridable per handler. Without it, `adapter`-routed actions (URI, Print)
 * report `no-adapter` diagnostics instead of executing.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-actions';
import { useEffect, useRef } from 'react';
import {
  ActionsToken,
  type ActionsCapability,
  type ActionUiAdapter,
} from '@embedpdf/plugin-actions';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { EventHook } from '@embedpdf/core';
import { createDefaultActionsUiAdapter } from '@embedpdf/web';

import { useCapability, useCapabilityEvent, useOptionalCapability } from './runtime';

/** The actions capability (execute / executeNamed / policy) for app code. */
export function useActions(): ActionsCapability {
  return useCapability(ActionsToken);
}

/** Subscribe to one actions event for the mounted lifetime: `useActionsEvent((actions) => actions.onExecuted, handler)`. */
export function useActionsEvent<T>(
  select: (actions: ActionsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(ActionsToken, select, handler);
}

/** Override any subset of the default adapter policy. */
export type ActionsUiHandlers = Partial<ActionUiAdapter>;

/**
 * Install the UI adapter for the active document's action dispatcher. The
 * default policy — the origin×phase visibility matrix, sanitizeExternalUri
 * URI opens, browser print/alert fallbacks — is `@embedpdf/web`'s
 * `createDefaultActionsUiAdapter`, written once for every binding; this
 * hook is React glue only (late-bound handlers, stage navigation,
 * identity-safe install/uninstall). The doc.print authority gate is
 * upstream (the actions plugin) and not overridable.
 */
export function useActionsUiAdapter(handlers?: ActionsUiHandlers): void {
  const actions = useOptionalCapability(ActionsToken);
  const stage = useOptionalCapability(StageToken);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!actions) return;
    const adapter: ActionUiAdapter = createDefaultActionsUiAdapter({
      overrides: () => handlersRef.current,
      goToPage: (page) => stage?.goToPageIndex(page),
    });
    return actions.setUiAdapter(adapter);
  }, [actions, stage]);
}
