import { effect } from '@angular/core';
import { ActionsToken, type ActionUiAdapter } from '@embedpdf/plugin-actions';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { createDefaultActionsUiAdapter } from '@embedpdf/web';

import { injectOptionalCapability } from '@embedpdf/angular/runtime';

/** Override any subset of the default adapter policy. */
export type ActionsUiHandlers = Partial<ActionUiAdapter>;

/**
 * Angular's spelling of React's `useActionsUiAdapter` (the `use*` →
 * `inject*` law): installs the UI adapter for the active document's action
 * dispatcher. The DEFAULT policy — the origin×phase visibility matrix,
 * sanitizeExternalUri URI opens, browser print/alert fallbacks — is
 * `@embedpdf/web`'s `createDefaultActionsUiAdapter`, written ONCE for every
 * binding; this function is Angular glue only. The doc.print AUTHORITY gate
 * is upstream (the actions plugin) and not overridable.
 *
 * Must run in an injection context (a constructor or field initializer —
 * the runtime `inject*` constraint). Pass a FUNCTION for late-bound
 * handlers; signal reads inside it are NOT tracked (the adapter consults it
 * per effect, the same contract as React's handlers ref). Installing an
 * adapter releases the document-open sequence latch, exactly as in React.
 */
export function injectActionsUiAdapter(
  handlers?: ActionsUiHandlers | (() => ActionsUiHandlers | undefined),
): void {
  const actions = injectOptionalCapability(ActionsToken);
  const stage = injectOptionalCapability(StageToken);
  const overrides = typeof handlers === 'function' ? handlers : (): typeof handlers => handlers;
  effect((onCleanup) => {
    const capability = actions();
    const stageCapability = stage();
    if (!capability) return; // no document yet — nothing to drive
    const adapter: ActionUiAdapter = createDefaultActionsUiAdapter({
      overrides,
      goToPage: (page) => stageCapability?.goToPage(page),
    });
    // Identity-safe by construction (the plugin's disposer only clears the
    // slot while THIS adapter is still current).
    onCleanup(capability.setUiAdapter(adapter));
  });
}
