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
import { ActionsToken, type ActionUiAdapter } from '@embedpdf/plugin-actions';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { createDefaultActionsUiAdapter } from '@embedpdf/web';

import { useOptionalCapability } from './runtime';

/** Override any subset of the default adapter policy. */
export type ActionsUiHandlers = Partial<ActionUiAdapter>;

/**
 * Install the UI adapter for the active document's action dispatcher. The
 * DEFAULT policy — the origin×phase visibility matrix, sanitizeExternalUri
 * URI opens, browser print/alert fallbacks — is `@embedpdf/web`'s
 * `createDefaultActionsUiAdapter`, written ONCE for every binding; this
 * hook is React glue only (late-bound handlers, stage navigation,
 * identity-safe install/uninstall). The doc.print AUTHORITY gate is
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
      goToPage: (page) => stage?.goToPage(page),
    });
    return actions.setUiAdapter(adapter);
  }, [actions, stage]);
}
