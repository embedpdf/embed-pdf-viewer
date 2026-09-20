/**
 * Inline binary payloads for annotation drafts/patches.
 *
 * Public rule (see also `annotation/normalize.ts`): binary data is a call
 * ARGUMENT, never engine state. Callers put bytes directly on the draft
 * field that names their role (stamp `source`, future file-attachment
 * `file`); normalization replaces each such field with a `ResourceRef`
 * and moves the bytes into a `WireResourceMap` that travels out-of-band
 * (worker: transferable buffers; cloud: multipart parts). After the call,
 * the only durable home for the bytes is the PDF itself.
 */

/**
 * Richest accepted input for a binary field. `mimeType` is advisory only —
 * every engine sniffs magic bytes and the sniffed format wins (the server
 * cannot trust a declared type anyway).
 */
export type BinarySource = Uint8Array | Blob | BinaryPayload;

export interface BinaryPayload {
  data: Uint8Array | Blob;
  /** Advisory only — engines always sniff magic bytes. */
  mimeType?: string;
  /** Optional display/file name (multipart `filename`, future /UF). */
  name?: string;
}

/**
 * A resolved binary payload in wire form: a PRIVATE COPY of the caller's
 * bytes, owned by the call and ready to ship (worker transfer list or
 * multipart part body). Ownership is the whole point: the local engine puts
 * `bytes` on a postMessage transfer list, which detaches the buffer, and a
 * `BinarySource` is a borrowed argument — never the caller's buffer to lose.
 * Blob sources yield fresh bytes by construction; Uint8Array sources are
 * copied here so a full-span view is not silently aliased and killed.
 */
export interface WireResource {
  bytes: ArrayBuffer;
  mimeType?: string;
  name?: string;
}

/** Keyed resources accompanying one mutation. Keys are allocator-generated (`r0`, `r1`, …). */
export type WireResourceMap = Record<string, WireResource>;

/** What replaces a `BinarySource` field in the wire form of a draft/patch. */
export interface ResourceRef {
  resource: string;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

/**
 * Copy a Uint8Array view into a fresh, exactly-sized ArrayBuffer the call
 * owns. Always copies — even when the view spans its whole buffer — because
 * the result may be transferred to a worker (detaching it), and the view is
 * the caller's. Returning `view.buffer` here would let one transfer zero
 * the caller's bytes (a stamp library's Uint8Array became single-use).
 * Callers wanting a zero-copy hand-off need an explicit "give" form, as
 * `pages.insert` has for bare ArrayBuffers; `BinarySource` has none.
 */
function toOwnedArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/**
 * Resolve any accepted `BinarySource` form into a `WireResource`.
 * Async because Blob bytes can only be read asynchronously.
 */
export async function resolveBinarySource(source: BinarySource): Promise<WireResource> {
  if (source instanceof Uint8Array) {
    return { bytes: toOwnedArrayBuffer(source) };
  }
  if (isBlob(source)) {
    const blobName = blobFileName(source);
    return {
      bytes: await source.arrayBuffer(),
      mimeType: source.type || undefined,
      ...(blobName !== undefined ? { name: blobName } : {}),
    };
  }
  const { data, mimeType, name } = source;
  const inner =
    data instanceof Uint8Array
      ? {
          bytes: toOwnedArrayBuffer(data),
          mimeType: undefined as string | undefined,
          name: undefined as string | undefined,
        }
      : {
          bytes: await data.arrayBuffer(),
          mimeType: data.type || undefined,
          name: blobFileName(data),
        };
  const resolvedName = name ?? inner.name;
  return {
    bytes: inner.bytes,
    ...((mimeType ?? inner.mimeType) ? { mimeType: mimeType ?? inner.mimeType } : {}),
    ...(resolvedName !== undefined ? { name: resolvedName } : {}),
  };
}

/** A browser `File` is a Blob with a `name` — pick it up so attachment
 *  drafts can pass a `File` directly without repeating the file name. */
function blobFileName(blob: Blob): string | undefined {
  const name = (blob as File).name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}
