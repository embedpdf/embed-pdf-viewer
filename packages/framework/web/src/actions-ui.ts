/**
 * The default actions UI adapter — the origin×phase visibility matrix plus
 * the browser fallbacks, written once here so every framework binding
 * (react, angular, …) ships the same policy instead of forking it per
 * framework. Types are structural twins of `@embedpdf/plugin-actions`'
 * adapter contract (declared here so this package stays plugin-free, per
 * the layering law); assignability is checked where a binding installs it.
 *
 * The matrix (defaults only — an embedder override receives every effect
 * with its context attached and decides for itself):
 * - URIs open through `sanitizeExternalUri` in a new tab (the dispatcher
 *   already policy-gated the node; blocked schemes are dropped here).
 * - Print: hover/lifecycle-origin requests never open the dialog; user
 *   requests fall back to `globalThis.print`. The `doc.print` authority
 *   gate is upstream in the plugin and not overridable.
 * - Alert: document-open nags (lifecycle origin, boot phase) never reach
 *   `window.alert` — the boot-nag gap, closed.
 * - gotoPage: delegates to the binding-supplied navigator (the stage).
 */
import { sanitizeExternalUri } from './external-uri';

/** Structural twin of plugin-actions' `ActionOrigin`. */
export type ActionsUiOrigin = 'user' | 'hover' | 'lifecycle';

/** Structural twin of plugin-actions' `ActionUiContext`. */
export interface ActionsUiEffectContext {
  origin: ActionsUiOrigin;
  phase: 'boot' | 'user';
}

/** Structural twin of plugin-actions' `ActionUiAdapter`. */
export interface ActionsUiAdapterShape {
  openUri(uri: string, options: { isMap: boolean; origin: ActionsUiOrigin }): void;
  print(options?: ActionsUiEffectContext): void;
  alert?(message: string, options: ActionsUiEffectContext & { icon: number; title?: string }): void;
  gotoPage?(page: number, options: ActionsUiEffectContext): void;
}

export interface DefaultActionsUiAdapterOptions {
  /**
   * Per-handler overrides. Pass a function for late binding (a binding's
   * mutable handlers ref) — it is consulted on every effect, so a fresh
   * closure never needs a reinstall.
   */
  overrides?: Partial<ActionsUiAdapterShape> | (() => Partial<ActionsUiAdapterShape> | undefined);
  /** Navigation default for script `this.pageNum = n` requests. */
  goToPage?: (page: number) => void;
}

export const createDefaultActionsUiAdapter = (
  options: DefaultActionsUiAdapterOptions = {},
): ActionsUiAdapterShape => {
  const overridesOf = (): Partial<ActionsUiAdapterShape> | undefined =>
    typeof options.overrides === 'function' ? options.overrides() : options.overrides;
  return {
    openUri: (uri, options) => {
      const current = overridesOf();
      if (current?.openUri) {
        current.openUri(uri, options);
        return;
      }
      const href = sanitizeExternalUri(uri);
      if (href && typeof window !== 'undefined') {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    },
    print: (options) => {
      const current = overridesOf();
      if (current?.print) current.print(options);
      else if (options && options.origin !== 'user') {
        // Hover/lifecycle scripts never open the print dialog by default.
      } else if (typeof globalThis.print === 'function') globalThis.print();
    },
    alert: (message, options) => {
      const current = overridesOf();
      if (current?.alert) current.alert(message, options);
      else if (options.origin === 'lifecycle' || options.phase === 'boot') {
        // Document-open nags (Adobe version checks, lifecycle scripts)
        // never alert by default — the boot-nag gap, closed.
      } else if (typeof globalThis.alert === 'function') globalThis.alert(message);
    },
    gotoPage: (page, effectContext) => {
      const current = overridesOf();
      if (current?.gotoPage) current.gotoPage(page, effectContext);
      else options.goToPage?.(page);
    },
  };
};
