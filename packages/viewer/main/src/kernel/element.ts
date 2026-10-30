/**
 * <embedpdf-viewer> — the custom element. A shadow root with the compiled
 * chrome stylesheet adopted, one wrapper div (the theme's `.dark` target, so
 * theming never touches the host page), and the Preact-compiled FullViewer
 * rendered inside. Light-DOM children are the page's own components, each
 * shown through the slot its `slot` attribute names: a toolbar item
 * (`item:<id>`), a panel's body (`panel:<id>`), or a region (`header`,
 * `footer`, `tabs`, `empty`); the viewer's own components among them
 * (`<epdf-button>`, `<epdf-menu>`) are drawn by the viewer (./components).
 *
 * Six keys follow their value while the viewer runs, from `.config`, their
 * own properties (`.src`, `.theme`, `.locale`, `.disable`, `.readOnly`,
 * `.fetch`) or the attributes: `src` opens the new document in place of the
 * old one, `theme` swaps the token sheet and the mode, `locale`, `disable` and
 * `readOnly` reach their plugins, and the next download uses the new `fetch`.
 * Changing any other key re-creates the viewer from scratch — documents and
 * all — which is the honest semantic for a workspace-owning embed.
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  FullViewer,
  defaultIcons,
  themeTokenCss,
  type FullViewerProps,
  type PanelResizeEvent,
  type Viewer,
  type ViewerFont,
  type ViewerPluginsConfig,
} from '@embedpdf/viewer-chrome';
import type { HostFetch } from '@embedpdf/core';
import type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';
import {
  changedConfigKeys,
  configFromAttributes,
  documentFromSrc,
  idOfSrc,
  initialDocumentsOf,
  isLiveConfigKey,
  isOpenInput,
  mergeConfig,
  pluginsOf,
  type ElementConfig,
  type ElementSrc,
  type SourceOf,
} from './config';
import { placedComponentsOf } from './components';
import { chromeSheet, sheetOf } from './sheets';

/** What a door makes of a config's `engine` field. */
export interface DoorEngine {
  readonly engine: Engine | EngineFactory;
  /** The fonts the field names, which the viewer registers on the engine and offers. */
  readonly fonts?: readonly ViewerFont[];
  /**
   * What a `src` in the words of this engine opens as, for an engine whose documents aren't a
   * URL, a file or bytes: the cloud's `{ token }` is the engine's `{ kind: 'token' }`. The
   * element applies it to `src`, `documents` and `.src`.
   */
  readonly sourceOf?: SourceOf;
  /** Plugin settings this engine needs, under the config's own, per plugin: a door whose stamp
   *  libraries open in another engine names that engine here. */
  readonly plugins?: ViewerPluginsConfig;
}

/**
 * Turns a config's `engine` field — that door's options bag, or nothing — into
 * the delivery's default engine. A door registers one (see ../local/register);
 * the engine-agnostic door registers none, which is precisely what makes its
 * `engine` field required.
 */
export type DefaultEngineProvider = (engineOption: unknown) => DoorEngine;

/** The attribute that marks the shadow wrapper: the viewer's root, which the chrome's sheet themes. */
const ROOT_ATTRIBUTE = 'data-embedpdf-root';
const ROOT = `[${ROOT_ATTRIBUTE}]`;

/**
 * The host is the box the page sizes. The wrapper inside it is the viewer's
 * own root, and nothing on the page reaches past it:
 *   - `all: initial` drops what the page would pass down (the body's font, letter spacing,
 *     alignment, color scheme…), then the viewer states its own text styles, in px, in its
 *     `--epdf-font` and `--epdf-text`. `all` leaves custom properties alone, so `--epdf-*` set
 *     on the page still theme the viewer.
 *   - Whether it shows or takes presses stays the page's call (`visibility`, `pointer-events`).
 *   - It is the containing block of everything inside, `position: fixed` too, so a dialog
 *     covers the viewer, not the page. Not `contain: paint`: menus may reach past the edge.
 */
const HOST_CSS =
  ':host{display:block;height:100%}' +
  `${ROOT}{all:initial;visibility:inherit;pointer-events:inherit;` +
  'display:block;position:relative;isolation:isolate;contain:layout;box-sizing:border-box;' +
  'height:100%;font-family:var(--epdf-font);font-size:16px;line-height:1.5;' +
  'color:var(--epdf-text);color-scheme:light;tab-size:4;-webkit-text-size-adjust:100%;' +
  'text-size-adjust:100%;-webkit-tap-highlight-color:transparent}' +
  `${ROOT}.dark{color-scheme:dark}`;

let sheets: CSSStyleSheet[] | null = null;
const adoptSheets = (): CSSStyleSheet[] => {
  sheets ??= [sheetOf(HOST_CSS), chromeSheet()];
  return sheets;
};

/**
 * Resolve the config's `engine` field into what FullViewer takes.
 *
 * - a function → an EngineFactory, passed through (viewer-owned lifetime);
 * - an object with `open` → a live Engine instance, passed through (borrowed);
 * - anything else (that door's engine OPTIONS, or nothing) → the door's
 *   registered default, with the fonts its options name. The local/snippet
 *   doors register the built-in engine; the `core` door registers nothing, so
 *   an engine-less config there is a configuration error, taught here.
 *
 * This is the whole reason `ElementConfig['engine']` is `unknown`: the element
 * recognises an engine, and otherwise forwards a sealed envelope to the only
 * code that can open it.
 */
function engineOf(config: ElementConfig): DoorEngine {
  const option = config.engine;
  if (typeof option === 'function') return { engine: option as EngineFactory };
  if (option && typeof (option as Engine).open === 'function') return { engine: option as Engine };

  const provider = EmbedPdfViewerElement.defaultEngineProvider;
  if (!provider) {
    throw new Error(
      '[embedpdf] no engine: this build has no default engine. Pass one in the config ' +
        "(`engine: () => yourEngine()`), or import '@embedpdf/viewer' (which bundles the " +
        "bundled local engine) instead of '@embedpdf/viewer/core'.",
    );
  }
  return provider(option);
}

/**
 * The CDN artifact compiles with NODE_ENV=production (no consumer bundler
 * will define it), which strips the chrome's dev-mode guardrails — so the
 * element validates unconditionally. A config typo eating a button silently
 * is worse for a snippet user than a console.warn is for anyone.
 */
function warnInvalidConfig(config: ElementConfig): void {
  try {
    // The layout is checked by the viewer, at every size it resolves at.
    for (const command of config.commands ?? []) {
      if (
        command.icon &&
        !(command.icon in defaultIcons) &&
        !(config.icons && command.icon in config.icons)
      ) {
        console.warn(`[embedpdf] command "${command.id}": unknown icon "${command.icon}"`);
      }
    }
  } catch (error) {
    console.warn('[embedpdf] invalid config:', error);
  }
}

/**
 * The base class, resolved defensively so this module is import-safe in node.
 * `class … extends HTMLElement` evaluates `HTMLElement` at module scope, which
 * is a ReferenceError under SSR — the reason a Next/Nuxt/SvelteKit consumer
 * otherwise has to hide the entire viewer import behind a client-only dynamic
 * import. With this, importing is safe anywhere and the element simply upgrades
 * once it reaches a real DOM; deferring the *render* stays an optimization
 * (you rarely want to boot an engine server-side), not a requirement.
 */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** The properties a framework may set before the element is defined (see `connectedCallback`). */
const PROPERTIES = ['config', 'src', 'theme', 'locale', 'disable', 'readOnly', 'fetch'] as const;

/**
 * What a framework wrapper puts on the element it renders: it sets `.config` itself, so the
 * element waits for it instead of mounting from its attributes. Without it, an element the server
 * rendered upgrades as soon as the viewer's code loads, before hydration gives it its config, and
 * starts a viewer the config then replaces (on the engine-agnostic door, one with no engine).
 * The wrappers write the attribute themselves, to keep their imports from the viewer type-only.
 */
const WRAPPED_ATTRIBUTE = 'data-epdf-wrapped';

/**
 * The document a `src` opened: the id its tab was reserved under, and the id it asked for, which
 * becomes the engine's own once it opens (an open input names no id of its own). `opened` settles
 * with that id, or null when it didn't open.
 */
interface SrcDocument {
  readonly reserved: string;
  id: string;
  readonly opened: Promise<string | null>;
}

export class EmbedPdfViewerElement extends ElementBase {
  static observedAttributes = ['src', 'locale', 'theme'];

  /**
   * The door's default engine, registered by importing a door that has one
   * (`../local/register`). A static rather than a module-level registry so the
   * mechanism is discoverable exactly where it is consumed — `engineOf` below.
   * `null` on the engine-agnostic door, on purpose.
   */
  static defaultEngineProvider: DefaultEngineProvider | null = null;

  #config: ElementConfig | null = null;
  #wrapper: HTMLDivElement | null = null;
  #root: Root | null = null;
  /** The config the running viewer shows, and the props it renders with. */
  #shown: ElementConfig | null = null;
  #props: FullViewerProps | null = null;
  /** What the running viewer's door makes of a `src` (`DoorEngine.sourceOf`). */
  #sourceOf: SourceOf = (src) => src;
  #viewer: Viewer | null = null;
  #srcDocument: SrcDocument | null = null;
  /** The ids of `src` documents still closing, which a new one must not take. */
  #closing = new Set<string>();
  /**
   * How the viewer downloads a URL: the shown config's `fetch`, read at each download, so a new
   * one needs no new viewer.
   */
  #fetch: HostFetch = (url, init) => {
    // A plain call: the browser's own `fetch` refuses any other `this`.
    const download = this.#shown?.fetch ?? globalThis.fetch;
    return download(url, init);
  };

  /**
   * The config, over the declarative attributes. Set on a running viewer, the
   * live keys change in place and any other change builds a new viewer.
   */
  set config(config: ElementConfig) {
    this.#config = config;
    this.#update();
  }
  get config(): ElementConfig {
    return mergeConfig(configFromAttributes(this), this.#config);
  }

  /**
   * The document: a URL, a `File`, or bytes (or what the door's engine opens). Another one opens
   * in its place, `null` closes it, and `undefined` goes back to the `src` attribute.
   */
  set src(src: ElementSrc | null | undefined) {
    this.#change({ src });
  }
  get src(): ElementSrc | null {
    return this.config.src ?? null;
  }

  /** `'light'`, `'dark'`, `'system'`, or the theme config. */
  set theme(theme: ElementConfig['theme']) {
    this.#change({ theme });
  }
  get theme(): ElementConfig['theme'] {
    return this.config.theme;
  }

  /** `'auto'` or a language code. */
  set locale(locale: ElementConfig['locale']) {
    this.#change({ locale });
  }
  get locale(): ElementConfig['locale'] {
    return this.config.locale;
  }

  /** The features and commands this viewer doesn't have. */
  set disable(disable: ElementConfig['disable']) {
    this.#change({ disable });
  }
  get disable(): ElementConfig['disable'] {
    return this.config.disable;
  }

  /** Every feature that changes the document off, or all but `except`. */
  set readOnly(readOnly: ElementConfig['readOnly']) {
    this.#change({ readOnly });
  }
  get readOnly(): ElementConfig['readOnly'] {
    return this.config.readOnly;
  }

  /** How a document at a URL downloads: your own `fetch`. The next download uses a new one. */
  set fetch(fetch: ElementConfig['fetch']) {
    this.#change({ fetch });
  }
  get fetch(): ElementConfig['fetch'] {
    return this.config.fetch;
  }

  /**
   * The viewer in code: `get(name)`, `documents`, `commands`, `watch`. Null
   * until `epdf:ready` fires (once per mount); a new one after a config change
   * builds a new viewer.
   */
  get viewer(): Viewer | null {
    return this.#viewer;
  }

  connectedCallback(): void {
    // A property set before this element was defined sits on the instance, in front of the
    // class's accessor: take it off and set it again through the accessor.
    for (const property of PROPERTIES) {
      if (!Object.prototype.hasOwnProperty.call(this, property)) continue;
      const value: unknown = Reflect.get(this, property);
      Reflect.deleteProperty(this, property);
      Reflect.set(this, property, value);
    }
    // A wrapper's element mounts when the wrapper sets `.config` (the setter mounts), also when
    // it upgrades over the server's HTML before hydration runs.
    if (this.hasAttribute(WRAPPED_ATTRIBUTE) && this.#config === null) return;
    // Deferred one microtask: a wrapper that doesn't mark its element inserts it and sets
    // `.config` in the same task, and mounting eagerly here would boot the whole viewer once
    // with the attributes and again with the real config. This covers plain HTML.
    queueMicrotask(() => {
      if (this.isConnected && !this.#root) this.#mount();
    });
  }

  disconnectedCallback(): void {
    this.#unmount();
  }

  attributeChangedCallback(): void {
    // Before the first mount the attributes are simply read then; after it, they follow.
    if (this.#root) this.#update();
  }

  #change(change: Partial<ElementConfig>): void {
    this.config = { ...this.#config, ...change };
  }

  /** Show the current config: in place when only live keys changed, else on a new viewer. */
  #update(): void {
    if (!this.isConnected) return; // connecting mounts
    const shown = this.#shown;
    if (!this.#root || !shown) {
      this.#mount();
      return;
    }
    const next = this.config;
    const changed = changedConfigKeys(shown, next);
    if (changed.length === 0) return;
    if (!changed.every(isLiveConfigKey)) {
      this.#mount();
      return;
    }
    this.#shown = next;
    if (changed.includes('theme')) this.#adoptSheets(next.theme);
    // `src` opens below, and `#fetch` reads the new `fetch` at the next download.
    if (changed.some((key) => key !== 'src' && key !== 'fetch')) {
      const { theme, locale, disable, readOnly } = next;
      this.#props = { ...this.#props!, theme, locale, disable, readOnly };
      this.#root.render(createElement(FullViewer, this.#props));
    }
    if (changed.includes('src')) this.#showSrc();
  }

  #unmount(): void {
    this.#viewer = null;
    this.#srcDocument = null;
    this.#closing.clear();
    this.#shown = null;
    this.#props = null;
    this.#root?.unmount();
    this.#root = null;
  }

  /** The viewer is live: `src` opens, then `epdf:ready` and the config's `onReady` say so. */
  #onReady = (viewer: Viewer): void => {
    this.#viewer = viewer;
    this.#showSrc();
    this.dispatchEvent(new CustomEvent('epdf:ready', { detail: { viewer } }));
    this.#shown?.onReady?.(viewer);
  };

  /** The active document changed: `epdf:documentchange` and the config's `onDocumentChange`. */
  #onDocumentChange = (documentId: string | null): void => {
    this.dispatchEvent(new CustomEvent('epdf:documentchange', { detail: { documentId } }));
    this.#shown?.onDocumentChange?.(documentId);
  };

  /** The user resized a panel: `epdf:panelresize` and the config's `onPanelResize`. */
  #onPanelResize = (event: PanelResizeEvent): void => {
    this.dispatchEvent(new CustomEvent('epdf:panelresize', { detail: event }));
    this.#shown?.onPanelResize?.(event);
  };

  /**
   * Open the document `src` names in the place of the one the previous `src` opened, which
   * closes. `documents` takes over from `src` when the config has them.
   */
  #showSrc(): void {
    const viewer = this.#viewer;
    const config = this.#shown;
    if (!viewer || !config || config.documents) return;
    const { documents } = viewer;
    const previous = this.#srcDocument;
    this.#srcDocument = null;
    // A tab's id changes once its source has said which document it is.
    const previousId = previous && documents.has(previous.id) ? previous.id : previous?.reserved;
    const position = previousId ? documents.getOrder().indexOf(previousId) : -1;
    // The new document opens before the old one closes, so the active one never switches to a
    // neighbour in between; an open input waits for the close (see documentFromSrc).
    let previousClosed: () => void = () => {};
    const closed = new Promise<void>((resolve) => (previousClosed = resolve));
    if (config.src != null) this.#openSrc(config.src, position, previous ? closed : undefined);
    if (previous) {
      const closingId = previous.id;
      this.#closing.add(closingId);
      const tried = new Set([previous.reserved, closingId]);
      const release = () => {
        this.#closing.delete(closingId);
        previousClosed();
      };
      Promise.all([...tried].map((id) => documents.close(id)))
        // One still opening is closed by its reserved id; one the engine renamed meanwhile, by
        // the id it opened under.
        .then(() => previous.opened)
        .then((id) => (id !== null && !tried.has(id) ? documents.close(id) : undefined))
        .then(release, release);
    }
  }

  /** Open `src` as the `src` document, at `position` in the tabs, once `after` settles. */
  #openSrc(given: ElementSrc, position: number, after?: Promise<void>): void {
    const { documents } = this.#viewer!;
    const src = this.#sourceOf(given);
    const id = this.#freeIdFor(src);
    const { source, name } = documentFromSrc(src, id, after);
    const before = new Set(documents.getOrder());
    // Its tab exists at once: the one id the order didn't have.
    const opening = documents.open(source, name !== undefined ? { name } : {});
    const reserved = documents.getOrder().find((tab) => !before.has(tab));
    const opened = opening.then(
      ({ document }) => document.id,
      () => null,
    );
    if (!reserved) return;
    const shown: SrcDocument = { reserved, id: isOpenInput(src) ? reserved : id, opened };
    this.#srcDocument = shown;
    void opened.then((openedId) => {
      if (openedId !== null) shown.id = openedId;
    });
    if (position >= 0) documents.move(reserved, position);
  }

  /** The id `src` asks for, or with a number after it while a document still has it. */
  #freeIdFor(src: ElementSrc): string {
    const wanted = idOfSrc(src);
    const taken = (id: string) => this.#closing.has(id) || Boolean(this.#viewer?.documents.has(id));
    let id = wanted;
    for (let index = 2; taken(id); index++) id = `${wanted}#${index}`;
    return id;
  }

  /** The chrome's sheets, and the theme's tokens after them, so they win over its defaults. */
  #adoptSheets(theme: ElementConfig['theme']): void {
    const tokens = themeTokenCss(theme, ROOT);
    this.shadowRoot!.adoptedStyleSheets = [...adoptSheets(), ...(tokens ? [sheetOf(tokens)] : [])];
  }

  #mount(): void {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' });
      this.#wrapper = document.createElement('div');
      this.#wrapper.setAttribute(ROOT_ATTRIBUTE, '');
      shadow.appendChild(this.#wrapper);
    }
    this.#unmount();

    const config = this.config;
    warnInvalidConfig(config);
    const {
      src: _src,
      documents,
      engine: _engine,
      theme,
      fetch: _fetch,
      ...customization
    } = config;
    this.#adoptSheets(theme);
    this.#shown = config;
    const { engine, fonts, sourceOf = (src) => src, plugins } = engineOf(config);
    this.#sourceOf = sourceOf;
    this.#props = {
      engine,
      fonts,
      initialDocuments: documents && initialDocumentsOf(documents, sourceOf),
      fetch: this.#fetch,
      theme,
      themeTarget: this.#wrapper,
      // The viewer's own components among the children (`<epdf-button>`, `<epdf-menu>`).
      components: placedComponentsOf(this),
      ...customization,
      plugins: pluginsOf(plugins, customization.plugins),
      // The element's own, which call the config's after its events.
      onReady: this.#onReady,
      onDocumentChange: this.#onDocumentChange,
      onPanelResize: this.#onPanelResize,
    };
    this.#root = createRoot(this.#wrapper!);
    this.#root.render(createElement(FullViewer, this.#props));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'embedpdf-viewer': EmbedPdfViewerElement;
  }
}

// Guarded for the same reason as ElementBase: no registry outside a browser.
if (typeof customElements !== 'undefined' && !customElements.get('embedpdf-viewer')) {
  customElements.define('embedpdf-viewer', EmbedPdfViewerElement);
}
