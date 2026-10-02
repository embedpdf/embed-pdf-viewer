/**
 * The actions plugin's service and features. The plugin runs a PDF's actions and has no DOM:
 * opening a website, printing and showing a script's alert are the app's job, through a UI
 * adapter. `withActionsUi()` installs the browser's defaults (a website opens in a new tab after
 * `sanitizeExternalUri`, printing opens the print dialog), and you can replace any of them.
 * Without it, an action that needs the adapter (a website, a print) is reported with a
 * `no-adapter` diagnostic instead of running.
 *
 * The defaults themselves (which effects may show for which start, the URI check, the browser
 * fallbacks) are `@embedpdf/web`'s `createDefaultActionsUiAdapter`, written once for every
 * framework; this file is the Angular glue.
 */
import { DestroyRef, inject, Injectable, untracked } from '@angular/core';
import {
  CapabilityBinding,
  devWarn,
  injectKernelHost,
  pluginService,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import {
  actionsPlugin,
  ActionsToken,
  type ActionsCapability,
  type ActionsConfig,
  type ActionUiAdapter,
} from '@embedpdf/plugin-actions';
import { StageToken, type StageCapability } from '@embedpdf/plugin-stage/contract';
import { createDefaultActionsUiAdapter } from '@embedpdf/web';

/**
 * The actions of the document in scope (`[epdfDocumentScope]`), else the active one:
 * `executeNamed()`, `execute()`, `dispatch()`, `getActionTree()`, the checks (`canExecuteNamed()`,
 * `isScriptingEnabled()`, …), the settings (`settings()`, `updateSettings()`, …, which work with
 * no document) and the streams (`executed$`, `diagnosticReported$`, `scriptFailed$`, …). With
 * no document every other call refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfActions extends pluginService({
  name: 'EpdfActions',
  feature: 'withActions()',
  token: ActionsToken,
  methods: [
    'executeNamed',
    'execute',
    'dispatch',
    'getActionTree',
    'isScriptingEnabled',
    'setUiAdapter',
    'setSubmitHandler',
    'registerExecutor',
    'runDocumentVerb',
    'prepareClose',
    'canExecute',
    'canExecuteNamed',
    'canDispatch',
  ],
  events: [
    'onExecuted',
    'onDiagnosticReported',
    'onScriptFailed',
    'onScriptDiagnosticReported',
    'onOpenSequenceCompleted',
  ],
}) {}

/** The actions plugin, for `provideEmbedPdf()`: `withActions({ javascript: { enabled: true } })`. */
export function withActions(config?: ActionsConfig): EmbedPdfFeature {
  return { plugins: [actionsPlugin(config)], services: [EpdfActions] };
}

/** Your own handlers for any of the adapter's effects: `openUri`, `print`, `alert`, `gotoPage`. */
export type ActionsUiHandlers = Partial<ActionUiAdapter>;

/**
 * The UI adapter of the active document's actions: the browser's defaults, with `handlers` in
 * place of any of them. `handlers` may be a function, which runs once in an injection context,
 * so your handlers can use your services:
 *
 *   withActionsUi(() => {
 *     const toasts = inject(Toasts);
 *     return { alert: (message) => toasts.show(message) };
 *   })
 *
 * It follows the active document, and the Stage showing it for page moves, and is installed in
 * the same change that makes a document ready, before anything inside it can run an action.
 * Installing it is also the first sign of a person that lets a document's opening actions run
 * (`openSequence: 'auto'`), so a document opened in a background tab waits until it's shown.
 * The `doc.print` permission is checked by the plugin, before any handler runs.
 */
export function withActionsUi(
  handlers?: ActionsUiHandlers | (() => ActionsUiHandlers),
): EmbedPdfFeature {
  return { plugins: [], setup: () => installActionsUi(handlers) };
}

/** Keep the adapter installed on the active document's actions while the viewer lives. */
function installActionsUi(handlers?: ActionsUiHandlers | (() => ActionsUiHandlers)): void {
  const host = injectKernelHost('withActionsUi()');
  if (!host.provides(ActionsToken)) {
    devWarn(
      'actions-ui-without-actions',
      'withActionsUi() has no actions plugin to give its handlers to. Add withActions() to provideEmbedPdf().',
    );
    return;
  }
  const overrides = typeof handlers === 'function' ? handlers() : handlers;
  const activeDocument = () => null;
  const actions = new CapabilityBinding(host, () => ActionsToken, activeDocument).capability;
  const stage = new CapabilityBinding(host, () => StageToken, activeDocument).capability;

  let installed: {
    actions: ActionsCapability;
    stage: StageCapability | null;
    remove: () => void;
  } | null = null;
  // On every change of the kernel, not in an effect: the adapter is there in the same change
  // that makes a document ready, so an action run as the document's UI appears finds it.
  const follow = () =>
    untracked(() => {
      const current = actions();
      const view = stage();
      if (installed?.actions === current && installed.stage === view) return;
      installed?.remove();
      installed = null;
      if (!current) return;
      const adapter: ActionUiAdapter = createDefaultActionsUiAdapter({
        overrides: () => overrides,
        goToPage: (page) => view?.goToPage(page),
      });
      installed = { actions: current, stage: view, remove: current.setUiAdapter(adapter) };
    });
  const stop = host.subscribe(follow);
  follow();
  inject(DestroyRef).onDestroy(() => {
    stop();
    installed?.remove();
  });
}
