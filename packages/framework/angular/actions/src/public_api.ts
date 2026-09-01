/**
 * @embedpdf/angular/actions — the action engine's UI port, Angular
 * spelling. `injectActionsUiAdapter()` installs the SHARED default policy
 * (`@embedpdf/web`'s `createDefaultActionsUiAdapter` — the same
 * origin×phase matrix React ships, written once so the two bindings can
 * never drift).
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-actions';
export * from './actions-adapter';
