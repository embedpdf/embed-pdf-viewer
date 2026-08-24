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
 * A resolved binary payload in wire form: bytes detached from any Blob and
 * ready to ship (worker transfer list or multipart part body).
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
 * Detach a Uint8Array view into a standalone ArrayBuffer without copying
 * when the view already spans its whole buffer.
 */
function toStandaloneArrayBuffer(view: Uint8Array): ArrayBuffer {
  if (
    view.byteOffset === 0 &&
    view.buffer instanceof ArrayBuffer &&
    view.byteLength === view.buffer.byteLength
  ) {
    return view.buffer;
  }
  return view.slice().buffer as ArrayBuffer;
}

/**
 * Resolve any accepted `BinarySource` form into a `WireResource`.
 * Async because Blob bytes can only be read asynchronously.
 */
export async function resolveBinarySource(source: BinarySource): Promise<WireResource> {
  if (source instanceof Uint8Array) {
    return { bytes: toStandaloneArrayBuffer(source) };
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
          bytes: toStandaloneArrayBuffer(data),
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
