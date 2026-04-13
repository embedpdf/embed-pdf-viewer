/**
 * Supported binary asset MIME types for stamp annotations.
 *
 * @public
 */
export type ImageMimeType = 'image/png' | 'image/jpeg' | 'application/pdf';

/**
 * Metadata extracted from a binary image buffer by inspecting magic bytes.
 * Raster formats include intrinsic pixel dimensions; PDF only identifies
 * the format (parsing MediaBox is non-trivial and unnecessary here).
 *
 * @public
 */
export type ImageMetadata =
  | { mimeType: 'image/png'; width: number; height: number }
  | { mimeType: 'image/jpeg'; width: number; height: number }
  | { mimeType: 'application/pdf' };

/**
 * Detect format and intrinsic dimensions of a binary image buffer.
 * Supports PNG, JPEG, and PDF detection.
 *
 * @returns metadata or `null` for unsupported/corrupt formats
 *
 * @public
 */
export function getImageMetadata(buffer: ArrayBuffer): ImageMetadata | null {
  if (buffer.byteLength < 4) return null;

  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return parsePng(buffer);
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return parseJpeg(buffer);
  }

  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { mimeType: 'application/pdf' };
  }

  return null;
}

function parsePng(buffer: ArrayBuffer): ImageMetadata | null {
  if (buffer.byteLength < 24) return null;
  const view = new DataView(buffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return null;
  return { mimeType: 'image/png', width, height };
}

function parseJpeg(buffer: ArrayBuffer): ImageMetadata | null {
  const bytes = new Uint8Array(buffer);
  let offset = 2;

  while (offset + 4 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;

    const marker = bytes[offset + 1];

    // SOF0 through SOF3 (baseline, progressive, lossless)
    if (marker >= 0xc0 && marker <= 0xc3) {
      if (offset + 9 > bytes.byteLength) return null;
      const view = new DataView(buffer, offset + 5);
      const height = view.getUint16(0);
      const width = view.getUint16(2);
      if (width === 0 || height === 0) return null;
      return { mimeType: 'image/jpeg', width, height };
    }

    // Skip non-SOF markers
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
    } else if (marker === 0xff) {
      offset += 1;
    } else {
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segLen;
    }
  }

  return null;
}
