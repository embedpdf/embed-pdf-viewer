/**
 * What `provideEmbedPdf(config, ...features)` takes: the config (the engine, the documents to
 * open, the viewer's settings) and one feature per plugin (`withStage()`, `withSearch()`).
 * Both are read once, when the viewer starts.
 */
import type { Provider, Type } from '@angular/core';
import type {
  AnyPlugin,
  Engine,
  Identity,
  InitialDocument,
  ViewerPageSettings,
} from '@embedpdf/core';

/**
 * The engine: an instance, or a function that makes one.
 *
 * - An instance is borrowed: the viewer uses it and never destroys it, so one engine made at
 *   module scope can serve every viewer and route.
 * - A function is the viewer's own: the viewer calls it in the browser when it starts, and
 *   destroys the engine when the component or route that provides the viewer goes away. It may
 *   return a promise, so `() => import('@embedpdf/engine').then((m) => m.localEngine())` keeps
 *   the engine out of the page's first download.
 */
export type EngineSource = Engine | (() => Engine | Promise<Engine>);

export interface EmbedPdfConfig {
  readonly engine: EngineSource;
  /**
   * Documents to open when the viewer starts. Every tab appears at once; the one marked
   * `active`, else the first, becomes the active document. One that fails shows `error` in its
   * tab and doesn't stop the others.
   */
  readonly initialDocuments?: readonly InitialDocument[];
  /**
   * Who the user is, for every document opened without an `identity` of its own. The local
   * engine only: the cloud engine reads it from the document's token. Change it later with
   * `inject(EpdfViewer).updateSettings({ identity })`.
   */
  readonly identity?: Identity;
  /**
   * What the user may do, as permissions, in every document opened without a `scope` of its
   * own. Left out, they may do everything.
   */
  readonly scope?: readonly string[];
  /** The color every part without a color of its own follows. CSS `--epdf-accent` wins over it. */
  readonly accent?: string;
  /** How pages look: `background` before the picture arrives, and the `shadow` under each page. */
  readonly page?: Partial<ViewerPageSettings>;
}

/**
 * One feature of `provideEmbedPdf()`: the plugins it registers, and the Angular side of them.
 * A plugin's entry point exports its feature as `withX(options)`.
 */
export interface EmbedPdfFeature {
  readonly plugins: readonly AnyPlugin[];
  /**
   * The plugin's services (`EpdfSearch`). They are provided next to the viewer, and again
   * under every `[epdfDocumentScope]`, where they act on that document.
   */
  readonly services?: readonly Type<unknown>[];
  /** Anything else the feature puts next to the viewer. */
  readonly providers?: readonly Provider[];
  /**
   * Runs once in the browser, right after the viewer is created, in the injection context of
   * the providers: it may `inject()` services and create effects, which live as long as the
   * viewer.
   */
  readonly setup?: () => void;
}

/** What the viewer is doing: starting, running, or failed to start (see `EpdfViewer.error()`). */
export type EpdfViewerStatus = 'starting' | 'ready' | 'error';
