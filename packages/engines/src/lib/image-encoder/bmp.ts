/**
 * Creates an uncompressed BMP blob from raw RGBA pixel data.
 *
 * Uses BI_BITFIELDS with channel masks matching RGBA byte order, so no
 * per-pixel byte swapping is needed. Top-down row order (negative height)
 * avoids row flipping. The result is a valid BMP that all modern browsers
 * can decode natively in `<img>` elements.
 *
 * This is dramatically faster than PNG/WebP/JPEG encoding via canvas.toBlob()
 * because it performs no compression — just a 66-byte header prepended to the
 * raw pixel buffer.
 */
export function rgbaToBmpBlob(rgba: Uint8ClampedArray, width: number, height: number): Blob {
  const pixels = width * height * 4;
  const headerLength = 66;
  const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  // prettier-ignore
  const header = new Uint8Array([
    0x42, 0x4D,                     // 'BM' signature
    ...le32(headerLength + pixels), // file size
    0, 0, 0, 0,                     // reserved
    headerLength, 0, 0, 0,          // pixel data offset
    40, 0, 0, 0,                    // DIB header size
    ...le32(width),                 // width
    ...le32(-height),               // height (negative = top-down)
    1, 0,                           // color planes
    32, 0,                          // bits per pixel
    3, 0, 0, 0,                     // compression = BI_BITFIELDS
    ...le32(pixels),                // image data size
    0, 0, 0, 0,                     // h resolution
    0, 0, 0, 0,                     // v resolution
    0, 0, 0, 0,                     // colors in palette
    0, 0, 0, 0,                     // important colors
    0xFF, 0, 0, 0,                  // R channel mask
    0, 0xFF, 0, 0,                  // G channel mask
    0, 0, 0xFF, 0,                  // B channel mask
  ]);

  return new Blob(
    [header, new Uint8Array(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength)],
    { type: 'image/bmp' },
  );
}
