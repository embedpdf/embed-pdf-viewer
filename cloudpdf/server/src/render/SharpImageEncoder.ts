import sharp from 'sharp';
import type { PageNetworkRenderFormat, PageRaster } from '@embedpdf/engine-core/runtime';

export interface EncodedPageImage {
  stream: sharp.Sharp;
  mimeType: `image/${PageNetworkRenderFormat}`;
}

export class SharpImageEncoder {
  encode(
    raster: PageRaster,
    opts: { format: PageNetworkRenderFormat; quality?: number },
  ): EncodedPageImage {
    const image = sharp(Buffer.from(raster.data), {
      raw: {
        width: raster.width,
        height: raster.height,
        channels: 4,
      },
    });

    if (opts.format === 'webp') {
      return {
        stream: image.webp(
          opts.quality === undefined ? {} : { quality: sharpQuality(opts.quality) },
        ),
        mimeType: 'image/webp',
      };
    }

    return {
      stream: image.png(),
      mimeType: 'image/png',
    };
  }

  /**
   * Encode to a materialized buffer — the derived-artifact store persists
   * bytes, not streams (the same bytes are sent and stored).
   */
  async encodeToBuffer(
    raster: PageRaster,
    opts: { format: PageNetworkRenderFormat; quality?: number },
  ): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const encoded = this.encode(raster, opts);
    const bytes = new Uint8Array(await encoded.stream.toBuffer());
    return { bytes, mimeType: encoded.mimeType };
  }
}

/** Engine quality is 0–1 (the `canvas.toBlob` scale); libvips takes 1–100. */
function sharpQuality(quality: number): number {
  return Math.min(100, Math.max(1, Math.round(quality * 100)));
}
