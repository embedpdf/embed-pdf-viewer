import type { Engine } from './Engine';
import type { FontService } from './FontService';
import type { LocalDocumentHandle } from './LocalDocumentHandle';
import { hasLocalEngineBrand } from './localEngineBrand';
import type { OpenInput, OpenOptions } from '../dto/OpenInput';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * The engine that runs PDFium itself, in the browser or in Node: the shared
 * {@link Engine} and what only it can do. `localEngine()` returns one, so an
 * app built on it reaches these without a check; code that takes any engine
 * checks with {@link isLocalEngine}.
 */
export interface LocalEngine extends Engine {
  open(input: OpenInput, options?: OpenOptions): AbortablePromise<LocalDocumentHandle>;

  /**
   * Start booting the engine (Worker spawn, WASM compile) without doing any
   * work. Idempotent and non-blocking: the engine boots on first use anyway,
   * so this only overlaps that boot with the app's own start.
   */
  warmup(): void;

  /** Runtime font registration and fallback fonts. See {@link FontService}. */
  readonly fonts: FontService;
}

/** Whether `engine` is the local engine, with its fonts and `warmup()`. */
export function isLocalEngine(engine: Engine): engine is LocalEngine {
  return hasLocalEngineBrand(engine);
}
