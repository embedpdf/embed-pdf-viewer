import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import type { PageRaster } from '@embedpdf/engine-core/runtime';
import { SharpImageEncoder } from '../src/render/SharpImageEncoder';

/** Deterministic noise, so a WebP's size follows its quality. */
function noise(width: number, height: number): PageRaster {
  const data = new Uint8Array(width * height * 4);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = i % 4 === 3 ? 255 : seed & 0xff;
  }
  return {
    width,
    height,
    stride: width * 4,
    color: 'rgba8',
    premultipliedAlpha: false,
    data: data.buffer,
  };
}

async function libvipsWebp(raster: PageRaster, quality: number): Promise<Uint8Array> {
  const image = sharp(Buffer.from(raster.data), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  });
  return new Uint8Array(await image.webp({ quality }).toBuffer());
}

describe('SharpImageEncoder', () => {
  test('WebP quality goes from 0 to 1, the local engine scale', async () => {
    const encoder = new SharpImageEncoder();
    const raster = noise(64, 64);
    const encode = async (quality: number) =>
      (await encoder.encodeToBuffer(raster, { format: 'webp', quality })).bytes;

    expect(await encode(1)).toEqual(await libvipsWebp(raster, 100));
    expect(await encode(0.5)).toEqual(await libvipsWebp(raster, 50));
    // libvips starts at 1.
    expect(await encode(0)).toEqual(await libvipsWebp(raster, 1));
    expect((await encode(0.05)).byteLength).toBeLessThan((await encode(1)).byteLength);
  });
});
