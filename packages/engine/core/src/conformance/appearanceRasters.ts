import type { PageHandle } from '../engine/PageHandle';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';

/**
 * Annotation appearances as pixels, for the suites that compare how an
 * annotation draws: the raw rasters where the engine returns them (local),
 * else its PNG images decoded (cloud).
 */

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel, no row padding. */
  rgba: Uint8Array;
}

/** Every normal appearance on a page, by annotation key, rendered at scale 1 in one call. */
export async function appearanceRasters(
  page: PageHandle,
  raw: boolean,
): Promise<Map<string, Raster>> {
  const rasters = new Map<string, Raster>();
  if (raw) {
    const { appearances } = await page.annotations.renderAppearancesRaw({
      viewport: { kind: 'scale', scale: 1 },
    });
    for (const { ref, mode, raster } of appearances) {
      if (mode !== 'normal') continue;
      const bytes = new Uint8Array(raster.data);
      const rgba = new Uint8Array(raster.width * raster.height * 4);
      for (let y = 0; y < raster.height; y++) {
        rgba.set(
          bytes.subarray(y * raster.stride, y * raster.stride + raster.width * 4),
          y * raster.width * 4,
        );
      }
      rasters.set(annotationKey(ref), { width: raster.width, height: raster.height, rgba });
    }
    return rasters;
  }
  const { appearances } = await page.annotations.renderAppearances({
    format: 'png',
    viewport: { kind: 'scale', scale: 1 },
  });
  for (const { ref, mode, image } of appearances) {
    if (mode !== 'normal' || image.source.kind !== 'bytes') continue;
    rasters.set(annotationKey(ref), await decodePng(image.source.bytes));
  }
  return rasters;
}

export async function appearanceRaster(
  page: PageHandle,
  ref: AnnotationRef,
  raw: boolean,
): Promise<Raster> {
  const key = annotationKey(ref);
  if (raw) {
    const { appearances } = await page.annotations.renderAppearancesRaw({
      viewport: { kind: 'scale', scale: 1 },
    });
    const found = appearances.find((a) => annotationKey(a.ref) === key && a.mode === 'normal');
    if (!found) throw new Error(`no appearance rendered for ${key}`);
    const { raster } = found;
    const bytes = new Uint8Array(raster.data);
    const rgba = new Uint8Array(raster.width * raster.height * 4);
    for (let y = 0; y < raster.height; y++) {
      rgba.set(
        bytes.subarray(y * raster.stride, y * raster.stride + raster.width * 4),
        y * raster.width * 4,
      );
    }
    return { width: raster.width, height: raster.height, rgba };
  }
  const { appearances } = await page.annotations.renderAppearances({
    format: 'png',
    viewport: { kind: 'scale', scale: 1 },
  });
  const found = appearances.find((a) => annotationKey(a.ref) === key && a.mode === 'normal');
  if (!found || found.image.source.kind !== 'bytes') {
    throw new Error(`no appearance image rendered for ${key}`);
  }
  return decodePng(found.image.source.bytes);
}

export function maxAlpha(raster: Raster): number {
  let max = 0;
  for (let i = 3; i < raster.rgba.length; i += 4) max = Math.max(max, raster.rgba[i]!);
  return max;
}

export function maxDifference(a: Raster, b: Raster): number {
  let max = 0;
  for (let i = 0; i < a.rgba.length; i++) max = Math.max(max, Math.abs(a.rgba[i]! - b.rgba[i]!));
  return max;
}

/**
 * The largest difference between a pixel of one raster and the closest
 * pixel of the other within `radius` pixels, both ways: an edge that moved
 * by a fraction of a pixel counts as the same, a changed area does not.
 */
export function maxShiftedDifference(a: Raster, b: Raster, radius = 1): number {
  const oneWay = (from: Raster, to: Raster) => {
    let max = 0;
    for (let y = 0; y < from.height; y++) {
      for (let x = 0; x < from.width; x++) {
        let best = 255;
        for (let dy = -radius; dy <= radius && best > 0; dy++) {
          for (let dx = -radius; dx <= radius && best > 0; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= to.height || nx >= to.width) continue;
            let difference = 0;
            for (let c = 0; c < 4; c++) {
              const delta = Math.abs(
                from.rgba[(y * from.width + x) * 4 + c]! - to.rgba[(ny * to.width + nx) * 4 + c]!,
              );
              if (delta > difference) difference = delta;
            }
            if (difference < best) best = difference;
          }
        }
        if (best > max) max = best;
      }
    }
    return max;
  };
  return Math.max(oneWay(a, b), oneWay(b, a));
}

/** An 8-bit, non-interlaced RGB or RGBA PNG as RGBA. Enough for the engines' own encoders. */
async function decodePng(png: Uint8Array): Promise<Raster> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const data: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (body[8] !== 8 || body[12] !== 0) throw new Error('only 8-bit non-interlaced PNGs');
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`unsupported PNG color type ${body[9]}`);
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }
  const compressed = new Blob(data as BlobPart[]);
  const inflated = new Uint8Array(
    await new Response(
      compressed.stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer(),
  );
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)]!;
    const line = inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      const predictor =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? (left + up) >> 1
              : filter === 4
                ? paeth(left, up, upLeft)
                : 0;
      pixels[y * stride + x] = (line[x]! + predictor) & 0xff;
    }
  }
  if (channels === 4) return { width, height, rgba: pixels };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba.set(pixels.subarray(i, i + 3), j);
    rgba[j + 3] = 255;
  }
  return { width, height, rgba };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
