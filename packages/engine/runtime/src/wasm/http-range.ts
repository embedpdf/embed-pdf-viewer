/**
 * HTTP byte-range cache for PDFium's synchronous `FPDF_FILEACCESS.GetBlock`.
 *
 * The transport is injected so tests never touch the network. The wasm runtime
 * supplies a synchronous `XMLHttpRequest` transport; `GetBlock` cannot await.
 */

/** Aligned chunk PDFium's reads are satisfied from. */
export const HTTP_RANGE_CHUNK = 256 * 1024;

/** The server did not answer this read with the byte range that was asked for. */
export class RangeUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RangeUnavailable';
  }
}

export interface RangeRead {
  status: number;
  bytes: Uint8Array;
  contentRange: string | null;
}

export interface RangeTransport {
  /**
   * Read `[start, end]` inclusive. `validator` is a strong ETag or
   * `Last-Modified`, sent as `If-Range` when present.
   */
  read(start: number, end: number, validator: string | null): RangeRead;
}

/** A strong validator for `If-Range`. Weak ETags are ignored. */
export function rangeValidator(etag: string | null, lastModified: string | null): string | null {
  if (etag && !etag.startsWith('W/')) return etag;
  return lastModified;
}

/**
 * The total length from a `Content-Range`, or null when the header is missing,
 * unsatisfiable (`*`), or does not describe `[start, end]` when those are given.
 */
export function parseContentRangeTotal(
  value: string | null,
  start?: number,
  end?: number,
): number | null {
  if (!value) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const rangeStart = Number(match[1]);
  const rangeEnd = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(rangeStart) ||
    !Number.isSafeInteger(rangeEnd) ||
    !Number.isSafeInteger(total) ||
    rangeEnd < rangeStart ||
    rangeEnd >= total
  ) {
    return null;
  }
  if (start !== undefined && rangeStart !== start) return null;
  if (end !== undefined && rangeEnd !== end) return null;
  return total;
}

/**
 * Bytes of one remote file, fetched in aligned chunks the first time a read
 * touches them. A later read of the same chunk does not hit the network.
 */
export class HttpRangeCache {
  private readonly chunks = new Map<number, Uint8Array>();
  private readonly transport: RangeTransport;
  readonly size: number;
  private readonly validator: string | null;
  private readonly chunkSize: number;

  constructor(
    transport: RangeTransport,
    size: number,
    validator: string | null,
    chunkSize = HTTP_RANGE_CHUNK,
  ) {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new RangeError('file size must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('chunk size must be a positive safe integer');
    }
    this.transport = transport;
    this.size = size;
    this.validator = validator;
    this.chunkSize = chunkSize;
  }

  /** Copy `[offset, offset + length)` out of the file. */
  read(offset: number, length: number): Uint8Array {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > this.size
    ) {
      throw new RangeError('read is outside the file');
    }
    const out = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const position = offset + filled;
      const index = Math.floor(position / this.chunkSize);
      const chunk = this.chunkAt(index);
      const inner = position - index * this.chunkSize;
      const take = Math.min(length - filled, chunk.byteLength - inner);
      out.set(chunk.subarray(inner, inner + take), filled);
      filled += take;
    }
    return out;
  }

  private chunkAt(index: number): Uint8Array {
    const cached = this.chunks.get(index);
    if (cached) return cached;

    const start = index * this.chunkSize;
    const end = Math.min(this.size, start + this.chunkSize) - 1;
    const response = this.transport.read(start, end, this.validator);
    const expected = end - start + 1;
    const total = parseContentRangeTotal(response.contentRange, start, end);
    if (response.status !== 206 || response.bytes.byteLength !== expected || total !== this.size) {
      throw new RangeUnavailable(
        `range ${start}-${end} was not honored (HTTP ${response.status})`,
      );
    }
    this.chunks.set(index, response.bytes);
    return response.bytes;
  }
}
