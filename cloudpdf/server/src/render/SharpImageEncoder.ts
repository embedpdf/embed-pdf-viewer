import sharp from 'sharp';
import type { PageNetworkRenderFormat, PageRaster } from '@embedpdf/engine-core/runtime';

export interface EncodedPageImage {
  stream: sharp.Sharp;
  contentType: `image/${PageNetworkRenderFormat}`;
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
        stream: image.webp(opts.quality === undefined ? {} : { quality: opts.quality }),
        contentType: 'image/webp',
      };
    }

    return {
      stream: image.png(),
      contentType: 'image/png',
    };
  }

  /**
   * Encode to a materialized buffer — the derived-artifact store persists
   * bytes, not streams (the same bytes are sent AND stored).
   */
  async encodeToBuffer(
    raster: PageRaster,
    opts: { format: PageNetworkRenderFormat; quality?: number },
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const encoded = this.encode(raster, opts);
    const bytes = new Uint8Array(await encoded.stream.toBuffer());
    return { bytes, contentType: encoded.contentType };
  }
}
