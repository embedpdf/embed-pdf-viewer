/**
 * <embedpdf-viewer> — the custom element. A shadow root with the compiled
 * chrome stylesheet adopted, one wrapper div (the theme's `.dark` target, so
 * theming never touches the host page), and the Preact-compiled FullViewer
 * rendered inside. Light-DOM children are reserved for the slot system
 * (children-as-slots), which lands with the framework wrappers.
 *
 * Config is INIT-ONLY, like the chrome it delivers: set `.config` (or the
 * declarative attributes) before/at connection; changing either on a live
 * element re-creates the viewer from scratch — documents and all — which is
 * the honest semantic for a workspace-owning embed.
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  FullViewer,
  chromeHelpers,
  defaultChrome,
  defaultCommands,
  defaultIcons,
  validateChrome,
  type Unsubscribe,
  type ViewerHandle,
} from '@embedpdf/viewer-chrome';
import { localEngine } from '@embedpdf/engine';
import EngineWorker from '@embedpdf/engine/worker-entry?worker';
import chromeCss from '@embedpdf/viewer-chrome/styles.css?inline';
import { configFromAttributes, initialDocumentsOf, type ViewerConfig } from './config';

const HOST_CSS = `:host{display:block;height:100%;}`;

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
 * The CDN artifact compiles with NODE_ENV=production (no consumer bundler
 * will define it), which strips the chrome's dev-mode guardrails — so the
 * ELEMENT validates unconditionally. A config typo eating a button silently
 * is worse for a snippet user than a console.warn is for anyone.
 */
function warnInvalidConfig(config: ViewerConfig): void {
  try {
    const ids = new Set(defaultCommands.map((c) => c.id));
    for (const c of config.commands ?? []) ids.add(c.id);
    const chrome =
      typeof config.chrome === 'function'
        ? config.chrome(defaultChrome, chromeHelpers)
        : (config.chrome ?? defaultChrome);
    for (const problem of validateChrome(chrome, ids)) {
      console.warn(`[embedpdf] chrome: ${problem}`);
    }
    for (const c of config.commands ?? []) {
      if (c.icon && !(c.icon in defaultIcons) && !(config.icons && c.icon in config.icons)) {
        console.warn(`[embedpdf] command "${c.id}": unknown icon "${c.icon}"`);
      }
    }
  } catch (error) {
    console.warn('[embedpdf] invalid config:', error);
  }
}

export class EmbedPdfViewerElement extends HTMLElement {
  static observedAttributes = ['src', 'locale', 'theme'];

  #config: ViewerConfig | null = null;
  #wrapper: HTMLDivElement | null = null;
  #root: Root | null = null;
  #viewer: ViewerHandle | null = null;
  #disposers: Unsubscribe[] = [];

  /** Full config — takes precedence over the declarative attributes. */
  set config(config: ViewerConfig) {
    this.#config = config;
    if (this.isConnected) this.#mount();
  }
  get config(): ViewerConfig {
    return this.#config ?? configFromAttributes(this);
  }

  /**
   * The DRIVE surface: public capability lenses (`viewer.get(AnnotationToken)`),
   * one `watch` primitive, and the command trio. Null until `epdf:ready` fires
   * (once per (re)mount); re-minted if the viewer is rebuilt by a config set.
   */
  get viewer(): ViewerHandle | null {
    return this.#viewer;
  }

  connectedCallback(): void {
    // Deferred one microtask: a framework wrapper inserts the element and
    // sets `.config` via ref/layout-effect in the SAME task — mounting eagerly
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
    // Attributes only drive attribute-configured elements; an explicit
    // `.config` object is authoritative and attribute churn is ignored.
    if (this.isConnected && !this.#config) this.#mount();
  }

  #unmount(): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];
    this.#viewer = null;
    this.#root?.unmount();
    this.#root = null;
  }

  /** Handle arrival = the viewer is live. `epdf:ready` is the addEventListener
   *  face of it; `epdf:documentchange` is sugar over `viewer.watch` — the one
   *  reactivity primitive remains the handle itself. */
  #onViewer = (viewer: ViewerHandle): void => {
    this.#viewer = viewer;
    this.#disposers.push(
      viewer.watch(
        () => viewer.documents.activeId(),
        (documentId) =>
          this.dispatchEvent(new CustomEvent('epdf:documentchange', { detail: { documentId } })),
      ),
    );
    this.dispatchEvent(new CustomEvent('epdf:ready', { detail: { viewer } }));
  };

  #mount(): void {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.adoptedStyleSheets = adoptSheets();
      this.#wrapper = document.createElement('div');
      this.#wrapper.style.height = '100%';
      shadow.appendChild(this.#wrapper);
    }
    this.#unmount();

    const config = this.config;
    warnInvalidConfig(config);
    const { src: _src, documents: _documents, theme, ...customization } = config;

    this.#root = createRoot(this.#wrapper!);
    this.#root.render(
      createElement(FullViewer, {
        // The snippet's one bundled decision: the local wasm engine, its
        // worker emitted by THIS package's build. Thunk = viewer-owned.
        engine: () => localEngine({ worker: () => new EngineWorker() }),
        initialDocuments: initialDocumentsOf(config),
        theme,
        themeTarget: this.#wrapper,
        onViewer: this.#onViewer,
        ...customization,
      }),
    );
  }
}

if (!customElements.get('embedpdf-viewer')) {
  customElements.define('embedpdf-viewer', EmbedPdfViewerElement);
}
