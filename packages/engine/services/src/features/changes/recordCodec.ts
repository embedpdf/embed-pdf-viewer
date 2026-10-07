import type { ChangeRecordPayload } from '@embedpdf/engine-core/runtime';

/**
 * A change's record as a caller stores it: the steps as JSON, every capture's
 * bytes moved into one blob and named in the JSON by where they are in it
 * (`{ "$capture": [offset, length] }`). `capture` is null when the record
 * holds no bytes.
 */
export interface PackedChangeRecord {
  readonly reverse: string;
  readonly capture: Uint8Array | null;
}

/** A record, packed for storage (see `PackedChangeRecord`). */
export function packChangeRecord(record: ChangeRecordPayload): PackedChangeRecord {
  const parts: Uint8Array[] = [];
  let length = 0;
  const reverse = JSON.stringify(record, (_key, value: unknown) => {
    if (!(value instanceof Uint8Array)) return value;
    const at = length;
    parts.push(value);
    length += value.byteLength;
    return { $capture: [at, value.byteLength] };
  });
  if (parts.length === 0) return { reverse, capture: null };
  const capture = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    capture.set(part, at);
    at += part.byteLength;
  }
  return { reverse, capture };
}

/** A record unpacked from its JSON and its capture blob. */
export function unpackChangeRecord(
  reverse: string,
  capture: Uint8Array | null,
): ChangeRecordPayload {
  return JSON.parse(reverse, (_key, value: unknown) => {
    const at = (value as { $capture?: unknown } | null)?.$capture;
    if (!Array.isArray(at)) return value;
    if (!capture) throw new Error('a change record names captured bytes it was stored without');
    const [offset, size] = at as [number, number];
    return capture.slice(offset, offset + size);
  }) as ChangeRecordPayload;
}
