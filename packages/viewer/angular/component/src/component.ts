/**
 * `<epdf-pdf-viewer>`, the Angular face of the `<embedpdf-viewer>` custom element, and
 * deliberately engine-blind: this module imports the viewer for types only, so it holds no
 * runtime edge to any engine. Which engine ships is decided by the door that declares the
 * component on top of {@link EpdfPdfViewerBase}:
 *
 *   `@embedpdf/viewer-angular`      → `@embedpdf/viewer`      — the local PDFium engine, the default
 *   `@embedpdf/viewer-angular/core` → `@embedpdf/viewer/core` — no default engine; you give one
 *
 * Each door's component adds only what that door's config says differently (`engine` and
 * `[config]`, typed for it); everything else is here. The component renders the element, hands
 * it the config before its deferred first mount, and once the viewer is ready shows your
 * templates in it (`EpdfViewerSlots`), each with an injector that gives the headless services of
 * `@embedpdf/angular` this viewer's kernel. When the viewer goes, they go with it, and come back
 * inside the next one. On the server it renders the empty element, and the viewer starts in the
 * browser: nothing here, or in the viewer it imports, touches the DOM when imported.
 *
 * `src`, `theme`, `locale`, `disable` and `readOnly` follow their inputs: the element changes
 * them in place. Every other key is read once, when the viewer starts; a later change is ignored
 * (development warns once), and a new `@if` branch mounts a new viewer with it.
 */
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  isDevMode,
  output,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
  type DestroyableInjector,
  type InputSignal,
  type OnInit,
  type Signal,
} from '@angular/core';
import type { Kernel } from '@embedpdf/angular/runtime';
// `ElementConfig` is the kernel's config, the widest of all, with the engine seam left
// `unknown`: the shared component sits above every door, and each door types its own inputs.
import type {
  ElementConfig,
  EmbedPdfViewerElement,
  LiveConfigKey,
  PanelResizeEvent,
  Viewer,
} from '@embedpdf/viewer/core';

import { provideViewerServices } from './services';
import { EpdfPanel, EpdfRegion, EpdfToolbarItem, EpdfToolbarItemView } from './slots';
import type { EpdfPdfViewerRef } from './viewer-ref';

/** Where the viewer keeps its kernel (`createViewer` in `@embedpdf/viewer-chrome`). */
const VIEWER_KERNEL = Symbol.for('@embedpdf/viewer/kernel');
const kernelOf = (viewer: Viewer): Kernel | null =>
  (viewer as unknown as Partial<Record<symbol, Kernel>>)[VIEWER_KERNEL] ?? null;

/** The keys the element follows while it runs; the component hands their changes on. */
const LIVE_KEYS: readonly LiveConfigKey[] = ['src', 'theme', 'locale', 'disable', 'readOnly'];

/** The callbacks: the outputs, and the config's own, called with the latest config. */
const CALLBACKS: ReadonlySet<string> = new Set(['onReady', 'onDocumentChange', 'onPanelResize']);

/** The first key read once whose value changed, or null. */
function changedReadOnceKey(initial: ElementConfig, next: ElementConfig): string | null {
  const before = initial as Readonly<Record<string, unknown>>;
  const after = next as Readonly<Record<string, unknown>>;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if ((LIVE_KEYS as readonly string[]).includes(key) || CALLBACKS.has(key)) continue;
    if (!Object.is(before[key], after[key])) return key;
  }
  return null;
}

/** `keys` without the ones left out: an input that is `undefined` gives nothing. */
export function definedOf<Keys extends object>(keys: Keys): Partial<Keys> {
  return Object.fromEntries(
    Object.entries(keys).filter(([, value]) => value !== undefined),
  ) as Partial<Keys>;
}

/**
 * The input of the config's key `Key`: its value, or left out. Written out, so the declarations
 * name the viewer's types by the viewer's own entry.
 */
type ConfigInput<Key extends keyof ElementConfig> = InputSignal<ElementConfig[Key] | undefined>;

/** A viewer that is ready, and the injector your templates in it get. */
export interface ViewerInside {
  readonly viewer: Viewer;
  readonly injector: Injector;
}

/**
 * The `<embedpdf-viewer>` element inside `<epdf-pdf-viewer>`: once its viewer is ready it shows
 * the templates you gave `owner` as its children, each in an element with the slot of its place
 * and `display: contents`, with the viewer's injector.
 */
@Component({
  selector: 'embedpdf-viewer',
  imports: [NgTemplateOutlet, EpdfToolbarItemView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The element waits for the config the owner sets, also over the server's HTML before hydration.
  host: { 'data-epdf-wrapped': '' },
  template: `
    @if (owner().inside(); as inside) {
      @for (item of owner().toolbarItems(); track item) {
        <div [attr.slot]="'item:' + item.id()" style="display: contents">
          <ng-container [epdfToolbarItemView]="item" [injector]="inside.injector" />
        </div>
      }
      @for (panel of owner().panels(); track panel) {
        <div [attr.slot]="'panel:' + panel.id()" style="display: contents">
          <ng-container *ngTemplateOutlet="panel.template; injector: inside.injector" />
        </div>
      }
      @for (region of owner().regions(); track region) {
        <div [attr.slot]="region.name()" style="display: contents">
          <ng-container *ngTemplateOutlet="region.template; injector: inside.injector" />
        </div>
      }
    }
  `,
})
export class EpdfViewerSlots {
  /** The `<epdf-pdf-viewer>` this element is the inside of. */
  readonly owner = input.required<EpdfPdfViewerBase>();
}

/**
 * Everything `<epdf-pdf-viewer>` is, but its door's own inputs: each door declares the component
 * on top of it, with its selector and template (`<embedpdf-viewer [owner]="this" />`), the
 * `EpdfPdfViewerRef` it provides, and {@link elementConfig}.
 */
@Directive()
export abstract class EpdfPdfViewerBase implements EpdfPdfViewerRef, OnInit {
  // ── the config, each key an input ──────────────────────────────────────────

  /** `'light'`, `'dark'`, `'system'`, or the theme config. Follows its input. */
  readonly theme: ConfigInput<'theme'> = input<ElementConfig['theme']>();
  /** `'auto'` or a language code. Follows its input. */
  readonly locale: ConfigInput<'locale'> = input<ElementConfig['locale']>();
  /** The features and commands this viewer doesn't have. Follows its input. */
  readonly disable: ConfigInput<'disable'> = input<ElementConfig['disable']>();
  /** Every feature that changes the document off, or all but `except`. Follows its input. */
  readonly readOnly: ConfigInput<'readOnly'> = input<ElementConfig['readOnly']>();
  /** Several documents, with their names and passwords; with these, `src` is ignored. */
  readonly documents: ConfigInput<'documents'> = input<ElementConfig['documents']>();
  readonly layout: ConfigInput<'layout'> = input<ElementConfig['layout']>();
  readonly commands: ConfigInput<'commands'> = input<ElementConfig['commands']>();
  readonly icons: ConfigInput<'icons'> = input<ElementConfig['icons']>();
  readonly strings: ConfigInput<'strings'> = input<ElementConfig['strings']>();
  readonly notAllowed: ConfigInput<'notAllowed'> = input<ElementConfig['notAllowed']>();
  readonly stamps: ConfigInput<'stamps'> = input<ElementConfig['stamps']>();
  readonly signatures: ConfigInput<'signatures'> = input<ElementConfig['signatures']>();
  readonly plugins: ConfigInput<'plugins'> = input<ElementConfig['plugins']>();

  // ── what the viewer tells ──────────────────────────────────────────────────

  /** The viewer is live: `get(name)`, `documents`, `commands`, `watch`. */
  readonly ready = output<Viewer>();
  /** The active document changed: its id, or null when none is open. */
  readonly documentChange = output<string | null>();
  /** The user resized a panel: its `id` and `width`, to keep for next time. */
  readonly panelResize = output<PanelResizeEvent>();

  // ── your templates ─────────────────────────────────────────────────────────

  /** The templates you put in it, by the place each one goes. */
  readonly toolbarItems = contentChildren(EpdfToolbarItem, { descendants: true });
  readonly panels = contentChildren(EpdfPanel, { descendants: true });
  readonly regions = contentChildren(EpdfRegion, { descendants: true });

  // ── the viewer ─────────────────────────────────────────────────────────────

  private readonly insideState = signal<(ViewerInside & { injector: DestroyableInjector }) | null>(
    null,
  );
  /** The viewer once it's ready, and the injector your templates in it get. */
  readonly inside: Signal<ViewerInside | null> = this.insideState.asReadonly();
  /** The `viewer` once it's ready, as {@link EpdfPdfViewerRef} gives it. */
  readonly viewer: Signal<Viewer | null> = computed(() => this.inside()?.viewer ?? null);
  private readonly slots = viewChild.required(EpdfViewerSlots, { read: ElementRef });
  /** The `<embedpdf-viewer>` element inside. */
  readonly element: Signal<EmbedPdfViewerElement> = computed(
    () => this.slots().nativeElement as EmbedPdfViewerElement,
  );

  /**
   * The config the element gets: `[config]`, with every input given over it. Each door makes it
   * from its own inputs and {@link sharedConfig}.
   */
  protected abstract readonly elementConfig: Signal<ElementConfig>;

  /** The inputs every door has, without the ones left out. */
  protected readonly sharedConfig: Signal<Partial<ElementConfig>> = computed(() =>
    definedOf({
      theme: this.theme(),
      locale: this.locale(),
      disable: this.disable(),
      readOnly: this.readOnly(),
      documents: this.documents(),
      layout: this.layout(),
      commands: this.commands(),
      icons: this.icons(),
      strings: this.strings(),
      notAllowed: this.notAllowed(),
      stamps: this.stamps(),
      signatures: this.signatures(),
      plugins: this.plugins(),
    }),
  );

  private readonly injector = inject(Injector);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** The element, and the config its viewer started with, once it has it. */
  private started: { element: EmbedPdfViewerElement; config: ElementConfig } | null = null;
  private warned = false;

  /** The element's callbacks, set once: each emits its output and calls the latest config's. */
  private readonly callbacks: Pick<
    ElementConfig,
    'onReady' | 'onDocumentChange' | 'onPanelResize'
  > = {
    onReady: (viewer) => {
      this.ready.emit(viewer);
      untracked(this.elementConfig).onReady?.(viewer);
    },
    onDocumentChange: (documentId) => {
      this.documentChange.emit(documentId);
      untracked(this.elementConfig).onDocumentChange?.(documentId);
    },
    onPanelResize: (event) => {
      this.panelResize.emit(event);
      untracked(this.elementConfig).onPanelResize?.(event);
    },
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.started?.element.removeEventListener('epdf:ready', this.onViewerReady);
      untracked(this.insideState)?.injector.destroy();
    });
    if (!this.browser) return;
    effect(() => {
      const config = this.elementConfig();
      untracked(() => this.follow(config));
    });
  }

  /**
   * Hands the element its config: inputs are set by now, and the element mounts its viewer a
   * microtask after it was connected, so the viewer starts exactly once, with this config.
   */
  ngOnInit(): void {
    if (!this.browser) return;
    const element = this.element();
    const config = untracked(this.elementConfig);
    this.started = { element, config };
    element.addEventListener('epdf:ready', this.onViewerReady);
    element.config = { ...config, ...this.callbacks };
  }

  /** A change of the inputs: the live keys go to the element, which compares them by value. */
  private follow(config: ElementConfig): void {
    if (!this.started) return;
    const { element } = this.started;
    element.src = config.src;
    element.theme = config.theme;
    element.locale = config.locale;
    element.disable = config.disable;
    element.readOnly = config.readOnly;
    if (this.warned || !isDevMode()) return;
    const key = changedReadOnceKey(this.started.config, config);
    if (key === null) return;
    this.warned = true;
    console.warn(
      `[embedpdf] <epdf-pdf-viewer>: \`${key}\` is read once, when the viewer starts, so the ` +
        'change is ignored. Pass a stable value (a field, a signal), or put the viewer in a new ' +
        '`@if` branch to mount a new one with it.',
    );
  }

  /** Each mount of the element brings a new viewer: your templates go inside it. */
  private readonly onViewerReady = (): void => {
    const viewer = this.started?.element.viewer;
    if (!viewer) return;
    untracked(this.insideState)?.injector.destroy();
    const kernel = kernelOf(viewer);
    const injector: DestroyableInjector = Injector.create({
      name: '<epdf-pdf-viewer>',
      providers: kernel ? provideViewerServices(kernel) : [],
      parent: this.injector,
    });
    this.insideState.set({ viewer, injector });
  };
}
