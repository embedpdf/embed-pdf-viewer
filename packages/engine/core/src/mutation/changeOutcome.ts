import type { RecordedChange } from './Change';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { Coordinates } from '../pageSpace/coordinates';

/**
 * The refusals a change keeps under its `opId`, like a success: the document
 * or the caller refused it, so asking again gets the same answer, even once
 * the document has changed so that it would apply. Anything else (an abort, a
 * lost race with another writer, an engine failure) applied nothing, is not
 * kept, and may run again.
 */
const KEPT_REFUSALS: ReadonlySet<EngineErrorCode> = new Set([
  EngineErrorCode.InvalidArg,
  EngineErrorCode.NotFound,
  EngineErrorCode.Forbidden,
  EngineErrorCode.ProtectedDocument,
  EngineErrorCode.MalformedPdf,
  EngineErrorCode.PayloadTooLarge,
  EngineErrorCode.ObjectNumberUnavailable,
  EngineErrorCode.LayerFull,
  EngineErrorCode.ChangeConflict,
  EngineErrorCode.UndoUnavailable,
]);

/** Whether a change refused with `code` keeps that answer (see `KEPT_REFUSALS`). */
export function isKeptRefusal(code: EngineErrorCode): boolean {
  return KEPT_REFUSALS.has(code);
}

/**
 * What a retry under the same `opId` must send: the change's fingerprint. The
 * same ops with the same bytes give the same fingerprint whatever the order
 * of their keys; bytes count by their content.
 */
export function changeFingerprint<C extends Coordinates, R>(change: RecordedChange<C, R>): string {
  const text = canonicalJson(change);
  return `${text.length.toString(36)}-${hashText(text)}`;
}

/** `value` as JSON with every object's keys sorted, and bytes as their length and hash. */
function canonicalJson(value: unknown): string {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return JSON.stringify({ $bytes: `${bytes.byteLength.toString(36)}-${hashBytes(bytes)}` });
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A 53-bit hash (cyrb53) of a string's UTF-16 units, in base 36. */
function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ unit, 2654435761);
    h2 = Math.imul(h2 ^ unit, 1597334677);
  }
  return finish(h1, h2);
}

/** The same hash over bytes. */
function hashBytes(bytes: Uint8Array): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  return finish(h1, h2);
}

function finish(h1: number, h2: number): string {
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
