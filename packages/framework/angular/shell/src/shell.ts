/**
 * The shell plugin's service, feature and directive: which panels, dialogs and menus are open.
 * The app draws them; these bind their open state to the viewer, so a command, a button and
 * your code open the same panel, and the layout can be stored and restored.
 *
 *   withShell()                           the plugin, for provideEmbedPdf()
 *   inject(EpdfShell)                     `openSurfaces()`, `openMenus()`, `open()`, `toggle()`, …
 *   shell.surface('comments')             one panel: `isOpen()`, `props()`, `open()`, `close()`
 *   <button epdfPanelToggle="comments">   a button that opens and closes one
 *
 * Without a document every panel reads as closed, no menu as open, and a surface's verbs do
 * nothing, so chrome outside `*epdfDocumentGate` can use them. The service's own methods then
 * refuse with `not-ready`, like every document plugin's.
 */
import { Directive, inject, Injectable, input, untracked, type Signal } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { shellPlugin, shellState, ShellToken } from '@embedpdf/plugin-shell';
import type { OpenSurfaceOptions, SurfaceProps } from '@embedpdf/plugin-shell';

/** One named panel, dialog or overlay of the service's document. */
export interface EpdfSurface {
  /** Whether it's open; false without a document. */
  readonly isOpen: Signal<boolean>;
  /** The props it was opened with, or updated to; empty when it has none. */
  readonly props: Signal<SurfaceProps>;
  /** Open it: `exclusive` closes the others of that group, `props` travel with it. */
  open(options?: OpenSurfaceOptions): void;
  close(): void;
  /** Open it when it's closed, close it when it's open. */
  toggle(options?: OpenSurfaceOptions): void;
}

const NO_PROPS: SurfaceProps = Object.freeze({});

/**
 * The panels, dialogs and menus of this part of the template's document: `openSurfaces()` and
 * `openMenus()` as signals, the shell's methods, `surfaceOpened$` and the other events, and
 * `surface(id)` for one panel.
 */
@Injectable({ providedIn: 'root' })
export class EpdfShell extends pluginService({
  name: 'EpdfShell',
  feature: 'withShell()',
  token: ShellToken,
  state: shellState,
  methods: [
    'isOpen',
    'getSurface',
    'listOpenSurfaces',
    'open',
    'close',
    'toggle',
    'updateSurfaceProps',
    'closeAll',
    'isMenuOpen',
    'listOpenMenus',
    'openMenu',
    'closeMenu',
    'toggleMenu',
    'closeAllMenus',
    'getSnapshot',
    'applySnapshot',
  ],
  events: ['onSurfaceOpened', 'onSurfaceClosed', 'onMenuOpened', 'onMenuClosed'],
}) {
  /**
   * One panel, dialog or overlay: `isOpen()` and `props()` as signals, and `open()`, `close()`
   * and `toggle()`. Pass a function for an id that changes (a component's input). Without a
   * document it reads as closed and its verbs do nothing.
   *
   *   protected readonly panel = inject(EpdfShell).surface('comments');
   */
  surface(id: string | (() => string)): EpdfSurface {
    const idOf = typeof id === 'function' ? id : () => id;
    const shell = this.binding.capability;
    // The verbs act on the document current when they're called, and on none without one.
    const now = () => untracked(shell);
    return {
      isOpen: this.binding.select((shell) => shell.isOpen(idOf()), false, Object.is),
      props: this.binding.select(
        (shell) => shell.getSurface(idOf())?.props ?? NO_PROPS,
        NO_PROPS,
        Object.is,
      ),
      open: (options) => now()?.open(untracked(idOf), options),
      close: () => now()?.close(untracked(idOf)),
      toggle: (options) => now()?.toggle(untracked(idOf), options),
    };
  }
}

/** The shell plugin: which panels, dialogs and menus are open, per document. */
export function withShell(): EmbedPdfFeature {
  return { plugins: [shellPlugin()], services: [EpdfShell] };
}

/**
 * A button of yours that opens and closes a panel, and says whether it's open
 * (`aria-expanded`). `epdfPanelToggleExclusive` gives the panel its group, so opening it
 * closes the group's other panel:
 *
 *   <button epdfPanelToggle="comments" epdfPanelToggleExclusive="right">Comments</button>
 *
 * The template reference has `isOpen()`: `#comments="epdfPanelToggle"`.
 */
@Directive({
  selector: '[epdfPanelToggle]',
  exportAs: 'epdfPanelToggle',
  host: {
    '(click)': 'toggle()',
    '[attr.aria-expanded]': 'isOpen()',
  },
})
export class EpdfPanelToggle {
  /** The panel's name. */
  readonly id = input.required<string>({ alias: 'epdfPanelToggle' });
  /** Its group: opening it closes the other open panel of the same group. */
  readonly exclusive = input<string | undefined>(undefined, { alias: 'epdfPanelToggleExclusive' });

  private readonly panel = inject(EpdfShell).surface(() => this.id());

  /** Whether the panel is open. */
  readonly isOpen: Signal<boolean> = this.panel.isOpen;

  /** Open the panel when it's closed, close it when it's open. */
  toggle(): void {
    const exclusive = this.exclusive();
    this.panel.toggle(exclusive === undefined ? undefined : { exclusive });
  }
}
