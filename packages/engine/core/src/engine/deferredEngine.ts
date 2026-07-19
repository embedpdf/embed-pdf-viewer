import type { Engine } from './Engine';
import type { OpenInput, OpenOptions } from '../dto/OpenInput';
import type { DocumentHandle } from './DocumentHandle';
import { AbortablePromise } from '../promise/AbortablePromise';
import { AbortError } from '../promise/AbortError';

/**
 * Wrap an async engine factory in a synchronously-available {@link Engine}.
 *
 * Every method on the Engine contract is async (the boundary was designed that
 * way to serve local-WASM and cloud-HTTP identically), so a facade that exists
 * NOW and awaits the real engine inside each call is contract-identical. This
 * lets a host build its kernel — and paint engine-free UI (i18n'd chrome,
 * loading states) — at t=0, while WASM compiles or the transport connects in
 * parallel. The engine is only reached for when a document is opened.
 *
 * The factory runs once, lazily, on the first engine call. To start the boot
 * eagerly (overlap it with first render instead of waiting for the first
 * `open()`), kick the promise off yourself and hand the facade a closure:
 *
 * ```ts
 * const booting = createEngine();               // starts NOW
 * const engine = deferredEngine(() => booting); // usable NOW
 * ```
 *
 * Feature detection and engine-specific setup (e.g. fallback-font
 * registration via `engine.fonts`) belong INSIDE the factory, where the real
 * engine is in hand. The facade deliberately does not expose the optional
 * `fonts` service: whether it exists is unknowable before the factory
 * resolves, and no caller should be probing capabilities on an engine that
 * hasn't booted.
 */
export function deferredEngine(factory: () => Promise<Engine>): Engine {
  let booting: Promise<Engine> | null = null;
  const engine = () => (booting ??= Promise.resolve(factory()));

  /** Await the factory, then delegate — propagating an outer abort into the
   *  inner call once it exists, and dropping the work if aborted before. */
  const forward = <T>(call: (engine: Engine) => AbortablePromise<T>): AbortablePromise<T> =>
    AbortablePromise.run(async (signal) => {
      const target = await engine();
      if (signal.aborted) throw new AbortError();
      const inner = call(target);
      const onAbort = () => inner.abort(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        return await inner;
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    });

  return {
    open: (input: OpenInput, options?: OpenOptions): AbortablePromise<DocumentHandle> =>
      forward((target) => target.open(input, options)),
    destroy: (): AbortablePromise<void> =>
      AbortablePromise.run(async () => {
        if (!booting) return; // never booted — nothing to destroy (and don't boot just to destroy)
        const target = await booting;
        await target.destroy();
      }),
  };
}
