import {
  EngineError,
  EngineErrorCode,
  signatureAppearanceBytes,
  sniffBinaryMetadata,
  type SignatureAppearance,
} from '@embedpdf/engine-core/runtime';
import { MARK_IMAGE_OR_NONE_SINCE } from '@embedpdf/engine-core/wire';

import { serverLacks } from '../transport/serverVersion';

/**
 * A signature field's mark on its way to the server: a visual fill, a
 * prepare and the change op `forms.setSignatureAppearance` all send it as
 * the part `appearance`, or as `null` for no mark. `appearance` is the mark
 * with its bytes read ({@link resolveSignatureAppearance}).
 */

/** The bytes of a mark's `appearance` part, or `null` for no mark. */
export function markPart(appearance: SignatureAppearance | null): ArrayBuffer | null {
  const mark = signatureAppearanceBytes(appearance);
  return mark && exactBuffer(mark.bytes);
}

/**
 * Refuse a mark before it is sent, when the server can't take it as it is
 * meant:
 *
 * - `{ pdf }` holds a PDF and nothing else. The part itself may be an image,
 *   so an image under `{ pdf }` is refused here.
 * - An image, and no mark, arrived in {@link MARK_IMAGE_OR_NONE_SINCE}: an
 *   older server is never sent them, and the refusal names both versions.
 *   `serverVersion` is what the server last said it is, `null` before it
 *   said so.
 */
export function assertServerTakesMark(
  appearance: SignatureAppearance | null,
  serverVersion: string | null,
): void {
  const mark = signatureAppearanceBytes(appearance);
  if (mark === null) {
    const lacking = serverLacks(
      serverVersion,
      'taking the mark out of a signature field',
      MARK_IMAGE_OR_NONE_SINCE,
    );
    if (lacking) throw lacking;
    return;
  }
  const format = sniffBinaryMetadata(exactBuffer(mark.bytes))?.mimeType;
  if (format !== 'image/png' && format !== 'image/jpeg') return;
  if (mark.declaredPdf) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'the appearance resource must be a PDF');
  }
  const lacking = serverLacks(
    serverVersion,
    "a PNG or a JPEG as a signature field's mark",
    MARK_IMAGE_OR_NONE_SINCE,
  );
  if (lacking) throw lacking;
}

/** The buffer holding exactly `bytes`: its own when it spans it, else a copy. */
export function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);
}
