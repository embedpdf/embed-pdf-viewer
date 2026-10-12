/**
 * <embedpdf-viewer> — the custom element. A shadow root with the compiled
 * chrome stylesheet adopted, one wrapper div (the theme's `.dark` target, so
 * theming never touches the host page), and the Preact-compiled FullViewer
 * rendered inside. Light-DOM children are reserved for the slot system
 * (children-as-slots), which lands with the framework wrappers.
 *
 * Five keys follow their value while the viewer runs, from `.config`, their
 * own properties (`.src`, `.theme`, `.locale`, `.disable`, `.readOnly`) or the
 * attributes: `src` opens the new document in place of the old one, `theme`
 * swaps the token sheet and the mode, and `locale`, `disable` and `readOnly`
 * reach their plugins. Changing any other key re-creates the viewer from
 * scratch — documents and all — which is the honest semantic for a
 * workspace-owning embed.
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  FullViewer,
  defaultIcons,
  themeConfigOf,
  themeTokenProperty,
  type FullViewerProps,
  type ThemeTokens,
  type Viewer,
} from '@embedpdf/viewer-chrome';
import type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';
import chromeCss from '@embedpdf/viewer-chrome/styles.css?inline';
import {
  changedConfigKeys,
  configFromAttributes,
  documentFromSrc,
  idOfSrc,
  isLiveConfigKey,
  mergeConfig,
  type DocumentSrc,
  type ElementConfig,
} from './config';

/**
 * Turns a config's `engine` field — that door's options bag, or nothing — into
 * the delivery's default engine. A door registers one (see ../local/register);
 * the engine-agnostic door registers none, which is precisely what makes its
 * `engine` field required.
 */
export type DefaultEngineProvider = (engineOption: unknown) => Engine | EngineFactory;

/** The attribute that marks the shadow wrapper: the viewer's root, which the chrome's sheet themes. */
const ROOT_ATTRIBUTE = 'data-embedpdf-root';
const ROOT = `[${ROOT_ATTRIBUTE}]`;

/**
 * The host is the box the page sizes. The wrapper inside it is the viewer's
 * own root, and nothing on the page reaches past it:
 *   - `all: initial` drops what the page would pass down (the body's font, letter spacing,
 *     alignment, color scheme…), then the viewer states its own text styles, in px. `all`
 *     leaves custom properties alone, so `--epdf-*` set on the page still theme the viewer.
 *   - Whether it shows or takes presses stays the page's call (`visibility`, `pointer-events`).
 *   - It is the containing block of everything inside, `position: fixed` too, so a dialog
 *     covers the viewer, not the page. Not `contain: paint`: menus may reach past the edge.
 */
const HOST_CSS =
  ':host{display:block;height:100%}' +
  `${ROOT}{all:initial;visibility:inherit;pointer-events:inherit;` +
  'display:block;position:relative;isolation:isolate;contain:layout;box-sizing:border-box;' +
  'height:100%;font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji",' +
  '"Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";font-size:16px;line-height:1.5;' +
  'color:var(--ep-fg);color-scheme:light;tab-size:4;-webkit-text-size-adjust:100%;' +
  'text-size-adjust:100%;-webkit-tap-highlight-color:transparent}' +
  `${ROOT}.dark{color-scheme:dark}`;

let sheets: CSSStyleSheet[] | null = null;
const adoptSheets = (): CSSStyleSheet[] => {
  if (!sheets) {
    sheets = [HOST_CSS, chromeCss].map((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    });
  }
  return sheets;
};

/**
 * The theme-token sheet: the overrides from `theme.tokens`/`theme.dark` on the
 * viewer's root, adopted after the chrome sheet so they win over its defaults
 * by order. Base tokens are re-stated for `.dark` (then dark overrides on top),
 * because the chrome's own `.dark` block would otherwise out-cascade a base
 * token. A public `--epdf-*` token is a default only: like the chrome's own, it
 * gives way to the page's value, read on the host as `--ep-host-<name>`.
 */
function buildTokenSheet(tokens?: ThemeTokens, dark?: ThemeTokens): CSSStyleSheet | null {
  const valid = (map: ThemeTokens): Array<[string, string]> =>
    Object.entries(map).filter(([name, value]) => {
      const ok = /^[a-z][a-z0-9-]*$/.test(name) && !/[{};]/.test(value);
      if (!ok) console.warn(`[embedpdf] theme: ignoring invalid token "${name}"`);
      return ok;
    });
  const publicNames = new Set<string>();
  const decl = (entries: Array<[string, string]>): string =>
    entries
      .map(([name, value]) => {
        const property = themeTokenProperty(name);
        if (!property.startsWith('--epdf-')) return `${property}:${value};`;
        publicNames.add(name);
        return `${property}:var(--ep-host-${name},${value});`;
      })
      .join('');

  const base = tokens ? valid(tokens) : [];
  const darkOnly = dark ? valid(dark) : [];
  const baseDecl = decl(base);
  const darkDecl = decl([...base, ...darkOnly]);
  const captures = [...publicNames]
    .map((name) => `--ep-host-${name}:var(--epdf-${name});`)
    .join('');
  const css =
    (captures ? `:host{${captures}}` : '') +
    (baseDecl ? `${ROOT}{${baseDecl}}` : '') +
    (darkDecl ? `${ROOT}.dark{${darkDecl}}` : '');
  if (!css) return null;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}

/**
 * Resolve the config's `engine` field into what FullViewer takes.
 *
 * - a function → an EngineFactory, passed through (viewer-owned lifetime);
 * - an object with `open` → a live Engine instance, passed through (borrowed);
 * - anything else (that door's engine OPTIONS, or nothing) → the door's
 *   registered default. The local/snippet doors register the built-in engine;
 *   the `core` door registers nothing, so an engine-less config there is a
 *   configuration error, taught here.
 *
 * This is the whole reason `ElementConfig['engine']` is `unknown`: the element
 * recognises an engine, and otherwise forwards a sealed envelope to the only
 * code that can open it.
 */
function engineOf(config: ElementConfig): Engine | EngineFactory {
  const option = config.engine;
  if (typeof option === 'function') return option as EngineFactory;
  if (option && typeof (option as Engine).open === 'function') return option as Engine;

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
const PROPERTIES = ['config', 'src', 'theme', 'locale', 'disable', 'readOnly'] as const;

/** The document a `src` opened: the id its tab was reserved under, and the id it asked for. */
interface SrcDocument {
  readonly reserved: string;
  readonly id: string;
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
  #viewer: Viewer | null = null;
  #srcDocument: SrcDocument | null = null;
  /** The ids of `src` documents still closing, which a new one must not take. */
  #closing = new Set<string>();

  /**
   * The config, over the declarative attributes. Set on a running viewer, the
   * five live keys change in place and any other change builds a new viewer.
   */
  set config(config: ElementConfig) {
    this.#config = config;
    this.#update();
  }
  get config(): ElementConfig {
    return mergeConfig(configFromAttributes(this), this.#config);
  }

  /**
   * The document: a URL, a `File`, or bytes. Another one opens in its place, `null` closes it,
   * and `undefined` goes back to the `src` attribute.
   */
  set src(src: DocumentSrc | null | undefined) {
    this.#change({ src });
  }
  get src(): DocumentSrc | null {
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
    // Deferred one microtask: a framework wrapper inserts the element and
    // sets `.config` via ref/layout-effect in the same task — mounting eagerly
    // here would boot the whole viewer once with attribute config and again
    // with the real one. The config setter mounts synchronously; this only
    // covers the purely-declarative path.
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
    if (changed.some((key) => key !== 'src')) {
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
    if (config.src != null) {
      const id = this.#freeIdFor(config.src);
      const [reserved] = documents.openAll([documentFromSrc(config.src, id)]);
      if (reserved) {
        this.#srcDocument = { reserved, id };
        if (position >= 0) documents.move(reserved, position);
      }
    }
    if (previous) {
      this.#closing.add(previous.id);
      const release = () => this.#closing.delete(previous.id);
      Promise.all([documents.close(previous.reserved), documents.close(previous.id)]).then(
        release,
        release,
      );
    }
  }

  /** The id `src` asks for, or with a number after it while a document still has it. */
  #freeIdFor(src: DocumentSrc): string {
    const wanted = idOfSrc(src);
    const taken = (id: string) => this.#closing.has(id) || Boolean(this.#viewer?.documents.has(id));
    let id = wanted;
    for (let index = 2; taken(id); index++) id = `${wanted}#${index}`;
    return id;
  }

  /** The chrome's sheets, and the theme's tokens after them. */
  #adoptSheets(theme: ElementConfig['theme']): void {
    const { tokens, dark } = themeConfigOf(theme);
    const tokenSheet = buildTokenSheet(tokens, dark);
    this.shadowRoot!.adoptedStyleSheets = [...adoptSheets(), ...(tokenSheet ? [tokenSheet] : [])];
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
    const { src: _src, documents, engine: _engine, theme, ...customization } = config;
    this.#adoptSheets(theme);
    this.#shown = config;
    this.#props = {
      engine: engineOf(config),
      initialDocuments: documents,
      theme,
      themeTarget: this.#wrapper,
      ...customization,
      // The element's own, which call the config's after its events.
      onReady: this.#onReady,
      onDocumentChange: this.#onDocumentChange,
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
