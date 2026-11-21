/**
 * `createViewer()`: a kernel, the plugins a reading viewer uses, and a controller over them,
 * for an app without a framework adapter (or a test). With an adapter, its `<Viewer>` owns the
 * kernel and `createViewerController(kernel)` (the adapter's `useViewerController()`) reads it.
 */
import { createKernel, isLocalEngine } from '@embedpdf/core';
import type {
  AnyPlugin,
  DeepPartial,
  Engine,
  EngineFactory,
  HostClock,
  HostPrinter,
  Kernel,
  OpenSource,
  ViewerSettings,
} from '@embedpdf/core';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { formPlugin } from '@embedpdf/plugin-form';
import { historyPlugin } from '@embedpdf/plugin-history';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { linkPlugin } from '@embedpdf/plugin-link';
import { outlinePlugin } from '@embedpdf/plugin-outline';
import { renderPlugin } from '@embedpdf/plugin-render';
import { searchPlugin } from '@embedpdf/plugin-search';
import { selectionPlugin } from '@embedpdf/plugin-selection';
import { stagePlugin } from '@embedpdf/plugin-stage';
import { browserClock } from '../clock';
import { browserPrinter } from '../printer';
import { browserTextMeasurer } from '../text-measurer';
import { createViewerController, type ViewerController } from './controller';

/**
 * The plugins a reading viewer uses, in a new list: pages (stage, render), text selection,
 * search, outline, links, annotations, forms and undo. Spread it and add your own.
 */
export function viewerPlugins(): AnyPlugin[] {
  return [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    searchPlugin(),
    outlinePlugin(),
    linkPlugin(),
    annotationPlugin(),
    formPlugin(),
    historyPlugin(),
  ];
}

export interface CreateViewerOptions {
  /**
   * The engine, as an instance (borrowed: never destroyed) or a function (called now, destroyed
   * with the viewer). `localEngine()` from `@embedpdf/engine` for the built-in one.
   */
  readonly engine: Engine | EngineFactory;
  /** The document to open once the viewer started: a URL, or any `OpenSource`. */
  readonly src?: string | OpenSource;
  /** Default: `viewerPlugins()`. */
  readonly plugins?: AnyPlugin[];
  readonly settings?: DeepPartial<ViewerSettings>;
  /** Default: the browser's frames and print dialog when there is a `window`, else none. */
  readonly clock?: HostClock;
  readonly printer?: HostPrinter;
}

export interface OwnedViewerController extends ViewerController {
  /** Settles once the kernel started and `src` (if any) opened or failed. */
  readonly ready: Promise<void>;
  /** Destroy the kernel, and the engine when it was given as a function. */
  destroy(): Promise<void>;
}

export function createViewer(options: CreateViewerOptions): OwnedViewerController {
  const ownsEngine = typeof options.engine === 'function';
  const engine: Engine = ownsEngine
    ? (options.engine as EngineFactory)()
    : (options.engine as Engine);
  if (isLocalEngine(engine)) engine.warmup();
  const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
  let kernel: Kernel;
  try {
    kernel = createKernel({
      engine,
      plugins: options.plugins ?? viewerPlugins(),
      settings: options.settings,
      clock: options.clock ?? (browser ? browserClock() : undefined),
      printer: options.printer ?? (browser ? browserPrinter() : undefined),
      measurer: browser ? browserTextMeasurer() : undefined,
    });
  } catch (error) {
    if (ownsEngine) void engine.destroy();
    throw error;
  }
  const controller = createViewerController(kernel);
  const ready = kernel.start().then(async () => {
    if (options.src !== undefined)
      await controller.open(options.src).then(
        () => {},
        () => {},
      );
  });
  let destroying: Promise<void> | null = null;
  return {
    ...controller,
    ready,
    destroy() {
      destroying ??= (async () => {
        controller.dispose();
        await kernel.destroy();
        if (ownsEngine) await engine.destroy();
      })();
      return destroying;
    },
  };
}
