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
import { sanitizeExternalUri } from '@embedpdf/web';

import { useOptionalCapability } from './runtime';

/** Override any subset of the default adapter policy. */
export type ActionsUiHandlers = Partial<ActionUiAdapter>;

/**
 * Install the UI adapter for the active document's action dispatcher. By
 * default URIs open in a new tab through `sanitizeExternalUri` (blocked
 * schemes are dropped — the dispatcher already policy-gated the node) and
 * Print delegates to the browser dialog. Pass handlers to replace either.
 * Identity-safe: uninstalls on unmount only while still the current adapter.
 */
export function useActionsUiAdapter(handlers?: ActionsUiHandlers): void {
  const actions = useOptionalCapability(ActionsToken);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!actions) return;
    const adapter: ActionUiAdapter = {
      openUri: (uri, opts) => {
        const current = handlersRef.current;
        if (current?.openUri) {
          current.openUri(uri, opts);
          return;
        }
        const href = sanitizeExternalUri(uri);
        if (href && typeof window !== 'undefined') {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      },
      print: () => {
        const current = handlersRef.current;
        if (current?.print) current.print();
        else if (typeof globalThis.print === 'function') globalThis.print();
      },
    };
    return actions.setUiAdapter(adapter);
  }, [actions]);
}
