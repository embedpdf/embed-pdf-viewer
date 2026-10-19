import {
  EngineError,
  EngineErrorCode,
  type PageImageOptions,
  type PageImageResult,
  type PageRaster,
} from '@embedpdf/engine-core/runtime';

import { encodeBmp } from './bmp';
import type { LocalImageEncoder } from './BrowserImageEncoder';

/**
 * The image encoder for places without a canvas: Node, Deno, a worker
 * without OffscreenCanvas. PNG is written here, its pixels deflated with the
 * platform's `CompressionStream` (Node 18+, every current browser), so it
 * needs no dependency and no Node import. BMP is uncompressed as always.
 * WebP has no portable encoder: pass your own `imageEncoder` for it.
 */
export class PortableImageEncoder implements LocalImageEncoder {
  async encode(
    raster: PageRaster,
    options: PageImageOptions,
    signal: AbortSignal,
  ): Promise<PageImageResult> {
    const format = options.format ?? 'png';
    if (signal.aborted) throw new EngineError(EngineErrorCode.Aborted, 'image encoding aborted');
    const pixels = new Uint8Array(raster.data);
    if (format === 'bmp') {
      return {
        width: raster.width,
        height: raster.height,
        format,
        contentType: 'image/bmp',
        source: { kind: 'bytes', bytes: encodeBmp(pixels, raster.width, raster.height) },
      };
    }
    if (format !== 'png') {
      throw new EngineError(
        EngineErrorCode.NotImplemented,
        `'${format}' needs a canvas to encode; here, render 'png' or 'bmp', or give the engine an imageEncoder`,
      );
    }
    const bytes = await encodePng(pixels, raster.width, raster.height, raster.stride);
    if (signal.aborted) throw new EngineError(EngineErrorCode.Aborted, 'image encoding aborted');
    return {
      width: raster.width,
      height: raster.height,
      format,
      contentType: 'image/png',
      source: { kind: 'bytes', bytes },
    };
  }
}

/**
 * An RGBA raster (straight alpha, `stride` bytes a row) as a PNG: 8-bit
 * RGBA, no interlace, each row with filter type 0.
 */
export async function encodePng(
  rgba: Uint8Array,
  width: number,
  height: number,
  stride = width * 4,
): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new EngineError(
      EngineErrorCode.RuntimeUnavailable,
      'PNG encoding needs CompressionStream (Node 18 or newer)',
    );
  }
  const rowBytes = width * 4;
  const scanlines = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const at = y * (rowBytes + 1);
    scanlines[at] = 0;
    scanlines.set(rgba.subarray(y * stride, y * stride + rowBytes), at + 1);
  }
  const compressed = await deflate(scanlines);

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  // compression, filter and interlace method: all 0

  const chunks = [
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array()),
  ];
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = new Uint8Array(signature.length + chunks.reduce((sum, c) => sum + c.length, 0));
  out.set(signature, 0);
  let offset = signature.length;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** zlib-wrapped deflate (what a PNG's `IDAT` chunk holds), via the platform. */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One PNG chunk: length, type, data, and the `CRC-32` of type and data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
