import type { PdfRequestOptions } from '@embedpdf/models';

const DEFAULT_CHUNK_SIZE = 256 * 1024;
const CONTENT_RANGE_PATTERN = /^bytes (\d+)-(\d+)\/(\d+)$/i;

interface RangeResponse {
  status: number;
  data: Uint8Array;
  content_range: string | null;
  etag?: string | null;
  last_modified?: string | null;
}

export class PdfRangeRepresentationChangedError extends Error {
  constructor(readonly content: Uint8Array) {
    super('PDF changed while range loading');
  }
}

export function exact_buffer(data: Uint8Array): ArrayBuffer {
  return data.byteOffset || data.byteLength !== data.buffer.byteLength
    ? data.slice().buffer
    : (data.buffer as ArrayBuffer);
}

type RangeRequester = (
  url: string,
  start: number,
  end: number,
  options?: PdfRequestOptions,
  if_range?: string,
) => RangeResponse;

type FullRequester = (url: string, options?: PdfRequestOptions) => RangeResponse;

function request_pdf(
  url: string,
  options?: PdfRequestOptions,
  range?: [number, number],
  if_range?: string,
): RangeResponse {
  const request = new XMLHttpRequest();
  request.open('GET', url, false);
  request.responseType = 'arraybuffer';
  request.withCredentials = options?.credentials === 'include';

  for (const [name, value] of Object.entries(options?.headers ?? {})) {
    if (!['range', 'if-range'].includes(name.toLowerCase())) request.setRequestHeader(name, value);
  }
  if (range) request.setRequestHeader('Range', `bytes=${range[0]}-${range[1]}`);
  if (if_range) request.setRequestHeader('If-Range', if_range);
  request.send();

  return {
    status: request.status,
    data: new Uint8Array(request.response as ArrayBuffer),
    content_range: request.getResponseHeader('Content-Range'),
    etag: request.getResponseHeader('ETag'),
    last_modified: request.getResponseHeader('Last-Modified'),
  };
}

const request_range: RangeRequester = (url, start, end, options, if_range) =>
  request_pdf(url, options, [start, end], if_range);

const request_full: FullRequester = request_pdf;

export class PdfRangeLoader {
  readonly chunk_size: number;
  file_length = 0;
  private full_content?: Uint8Array;
  private chunks = new Map<number, Uint8Array>();
  private if_range?: { name: 'etag' | 'last-modified'; value: string };

  constructor(
    private url: string,
    private options?: PdfRequestOptions,
    chunk_size = DEFAULT_CHUNK_SIZE,
    private requester: RangeRequester = request_range,
    private full_requester: FullRequester = request_full,
  ) {
    if (!Number.isInteger(chunk_size) || chunk_size < 1) {
      throw new Error('Range chunk size must be a positive integer');
    }
    this.chunk_size = chunk_size;
    this.fetch_chunk(0);
  }

  get content(): ArrayBuffer | undefined {
    return this.full_content && exact_buffer(this.full_content);
  }

  read(offset: number, length: number): Uint8Array {
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0) {
      throw new Error('Invalid PDF byte range');
    }
    if (offset + length > this.file_length) {
      throw new Error(`PDF byte range ${offset}-${offset + length - 1} is out of bounds`);
    }
    if (!length) return new Uint8Array();
    if (this.full_content) return this.full_content.slice(offset, offset + length);

    const data = new Uint8Array(length);
    let source_offset = offset;
    let target_offset = 0;

    while (target_offset < length) {
      const full_content = this.slice_full_content(offset, length);
      if (full_content) return full_content;

      const chunk_start = Math.floor(source_offset / this.chunk_size) * this.chunk_size;
      const chunk = this.chunks.get(chunk_start) ?? this.fetch_chunk(chunk_start);
      const offset_in_chunk = source_offset - chunk_start;
      const copy_length = Math.min(chunk.length - offset_in_chunk, length - target_offset);

      if (copy_length < 1) throw new Error(`Range response did not contain byte ${source_offset}`);
      data.set(chunk.subarray(offset_in_chunk, offset_in_chunk + copy_length), target_offset);
      source_offset += copy_length;
      target_offset += copy_length;
    }

    return data;
  }

  private slice_full_content(offset: number, length: number): Uint8Array | undefined {
    return this.full_content?.slice(offset, offset + length);
  }

  private fetch_chunk(start: number): Uint8Array {
    const end = Math.min(start + this.chunk_size, this.file_length || Number.MAX_SAFE_INTEGER) - 1;
    let range_error: unknown;

    try {
      const response = this.requester(this.url, start, end, this.options, this.if_range?.value);
      if (response.status === 200) return this.use_full_content(response.data, start);
      if (response.status !== 206) {
        throw new Error(`PDF range request failed with status ${response.status}`);
      }

      const match = response.content_range?.match(CONTENT_RANGE_PATTERN);
      if (!match) throw new Error('PDF range response is missing a valid Content-Range header');

      const response_start = Number(match[1]);
      const response_end = Number(match[2]);
      const file_length = Number(match[3]);
      if (
        response_start !== start ||
        response_end !== Math.min(end, file_length - 1) ||
        response.data.length !== response_end - response_start + 1 ||
        !Number.isSafeInteger(file_length) ||
        file_length < response_end + 1 ||
        (this.file_length && this.file_length !== file_length)
      ) {
        throw new Error('PDF range response does not match the requested bytes');
      }

      const response_validator =
        this.if_range?.name === 'etag' ? response.etag : response.last_modified;
      if (this.if_range && response_validator && this.if_range.value !== response_validator) {
        throw new PdfRangeRepresentationChangedError(new Uint8Array());
      }

      if (!this.if_range && response.etag && !response.etag.startsWith('W/')) {
        this.if_range = { name: 'etag', value: response.etag };
      } else if (!this.if_range && response.last_modified) {
        this.if_range = { name: 'last-modified', value: response.last_modified };
      }
      this.file_length = file_length;
      this.chunks.set(start, response.data);
      return response.data;
    } catch (error) {
      if (error instanceof PdfRangeRepresentationChangedError && error.content.length) throw error;
      range_error = error;
    }

    try {
      const response = this.full_requester(this.url, this.options);
      if (response.status === 200) return this.use_full_content(response.data, start);
    } catch (error) {
      if (error instanceof PdfRangeRepresentationChangedError) throw error;
      throw range_error;
    }
    throw range_error;
  }

  private use_full_content(content: Uint8Array, start: number): Uint8Array {
    if (this.file_length && content.length !== this.file_length) {
      throw new PdfRangeRepresentationChangedError(content);
    }
    for (const [offset, chunk] of this.chunks) {
      if (chunk.some((byte, index) => content[offset + index] !== byte)) {
        throw new PdfRangeRepresentationChangedError(content);
      }
    }

    this.full_content = content;
    this.file_length = content.length;
    this.chunks.clear();
    return content.subarray(start, Math.min(start + this.chunk_size, content.length));
  }
}
