/**
 * Wire-level packaging for messages crossing a Web Worker / Node
 * `worker_thread` boundary.
 *
 * `WirePack<P>` is the typed pair every producer hands to a transport:
 * the structured payload (validated against the wire schema) and an
 * explicit, ordered list of `Transferable` objects that the producer
 * intends to move (zero-copy) to the receiver.
 *
 * Why this is a first-class type and not a transport-side argument:
 *
 *   - **Producer is the only one who knows.** Whether a particular
 *     `ArrayBuffer` should be moved (zero-copy, sender's reference
 *     detached) or copied (structured-cloned, both sides retain
 *     access) is a semantic decision belonging to the code that
 *     produced the buffer. Inferring it later — by walking the
 *     payload looking for `ArrayBuffer` instances and assuming they
 *     should all be transferred — is the v2 footgun this design
 *     replaces.
 *
 *   - **Type-checked at the boundary.** A handler returning
 *     `WirePack<RenderResult>` cannot forget to declare its
 *     transfer list; the producer literally writes
 *     `wirePack({ ..., pixels }, [pixels.buffer])` in a single
 *     return statement. Forgetting yields a structurally identical
 *     copy (slow but correct), never a silent leak.
 *
 *   - **Symmetric across the boundary.** Same `WirePack<P>` on the
 *     request path (main → worker) and the response path (worker →
 *     main). Inline transports treat `transfer` as a no-op since
 *     there's no thread boundary to cross.
 *
 *   - **Schema-orthogonal.** Zod schemas validate `payload` and
 *     nothing else. `transfer` is not data; it's a memory-ownership
 *     manifest, and the design keeps those concerns separate.
 *
 * The receiver of a `postMessage(payload, { transfer })` call gets
 * the payload back **with the listed buffers already moved into it**
 * — there's no second argument on the receiving end. So `WirePack`
 * only ever travels the producer-to-transport leg of the trip; the
 * consumer side just sees the unwrapped `payload`.
 */
export interface WirePack<P> {
  readonly payload: P;
  readonly transfer: readonly Transferable[];
}

/**
 * Singleton empty transfer list. Frozen so accidental in-place
 * mutation throws in strict mode rather than silently mutating the
 * default for future calls.
 */
export const EMPTY_TRANSFER: readonly Transferable[] = Object.freeze([]);

/**
 * Producer-side helper: pair a typed payload with its transfer list.
 *
 * The `transfer` argument is optional; omitting it (or passing `[]`)
 * is the explicit, type-checked way to say "I declare this message
 * carries no transferables." That's structurally identical to the
 * shape the v2 walker generated for non-binary messages, but here
 * the declaration is at construction time, in the producer's own
 * code, where the knowledge actually lives.
 *
 *   wirePack({ kind: 'metadata.read', jobId, docId })
 *   wirePack({ kind: 'open.fatMem', jobId, docId, bytes }, [bytes])
 *   wirePack({ tag: 'page.render', pixels }, [pixels.buffer])
 */
export function wirePack<P>(
  payload: P,
  transfer: readonly Transferable[] = EMPTY_TRANSFER,
): WirePack<P> {
  return { payload, transfer };
}
