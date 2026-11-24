import type { SignatureAppearance } from './types';
import { resolveAnnotationResources } from '../annotation/resources';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * The two readers of a {@link SignatureAppearance}: every caller's mark goes
 * through {@link resolveSignatureAppearance} on its way out, and every write
 * reads it with {@link signatureAppearanceBytes}. So its spelling is read in
 * this one file.
 */

/** A mark where it is written: its bytes, and what its caller said they are. */
export interface SignatureAppearanceBytes {
  bytes: Uint8Array;
  /**
   * Whether the caller passed the bytes as `{ pdf }`. They are then read as a
   * PDF and nothing else. Bytes passed as themselves say their own format.
   */
  declaredPdf: boolean;
}

/**
 * A mark in the spelling its caller chose, with bytes the write owns, ready
 * for a worker's transfer list or a multipart part: the caller's bytes are
 * only read, and a `Blob` is read here. `null`, no mark, stays `null`.
 *
 * A mark passed as its bytes is an `appearance` resource and is checked as a
 * stamp's is (`resolveAnnotationResources`): bytes that are no PNG, JPEG or
 * PDF are refused here, before anything is sent. `{ pdf }` names its format,
 * so its bytes are sent unchecked and read as a PDF where they are drawn.
 */
export async function resolveSignatureAppearance(
  appearance: SignatureAppearance | null,
): Promise<Uint8Array<ArrayBuffer> | { pdf: Uint8Array<ArrayBuffer> } | null> {
  if (appearance === null) return null;
  if (isKeyedPdf(appearance)) return { pdf: appearance.pdf.slice() as Uint8Array<ArrayBuffer> };
  const { appearance: bytes } = await resolveAnnotationResources({ appearance });
  return new Uint8Array(bytes!);
}

/**
 * A mark where it is written, or `null` for no mark. A caller's `Blob` is
 * read on its way out ({@link resolveSignatureAppearance}), so one that
 * reaches a write is refused.
 */
export function signatureAppearanceBytes(
  appearance: SignatureAppearance | null,
): SignatureAppearanceBytes | null {
  if (appearance === null) return null;
  const declaredPdf = isKeyedPdf(appearance);
  const bytes = declaredPdf ? appearance.pdf : appearance;
  if (ArrayBuffer.isView(bytes)) return { bytes, declaredPdf };
  throw new EngineError(
    EngineErrorCode.InvalidArg,
    'a signature appearance reaches a write as bytes, never as a Blob',
  );
}

function isKeyedPdf(appearance: SignatureAppearance): appearance is { pdf: Uint8Array } {
  return !ArrayBuffer.isView(appearance) && !isBlob(appearance);
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}
