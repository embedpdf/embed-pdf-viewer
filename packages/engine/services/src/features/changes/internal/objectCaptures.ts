import { EngineError } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { exportDict, importDict } from './captures';
import type { DocumentSession } from '../../../document-session/DocumentSession';
import type { CapturedObject } from '../ChangeRecord';

/** A dictionary an op is about to write, captured as it is (null: it doesn't exist yet). */
export interface PendingCapture {
  readonly objectNumber: number;
  readonly deep: readonly string[];
  readonly before: Uint8Array | null;
}

/**
 * Captures each dictionary before an op writes it: every key, and under
 * `deep` (such as `/AP`) the objects the layer holds.
 */
export function captureBefore(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  objects: readonly { readonly objectNumber: number; readonly deep: readonly string[] }[],
): PendingCapture[] {
  const captured = new Map<number, PendingCapture>();
  for (const { objectNumber, deep } of objects) {
    if (objectNumber <= 0 || captured.has(objectNumber)) continue;
    const before = tryExportDict(runtime, session, objectNumber, deep);
    captured.set(objectNumber, { objectNumber, deep, before });
  }
  return [...captured.values()];
}

/** Completes captures once the op has written: each dictionary as the op left it, the guard. */
export function captureAfter(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pending: readonly PendingCapture[],
): CapturedObject[] {
  return pending.map((object) => ({
    ...object,
    after: exportDict(runtime, session.requireDocPtr(), object.objectNumber, []),
  }));
}

/** Whether every dictionary still reads exactly as the op left it. */
export function unchangedSince(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  objects: readonly CapturedObject[],
): boolean {
  return objects.every((object) => {
    const now = tryExportDict(runtime, session, object.objectNumber, []);
    return now !== null && sameBytes(now, object.after);
  });
}

/**
 * Puts every dictionary back as it was before the op (one the op made is left
 * as it is: nothing reaches it any more). Returns the captures that redo the
 * op: each dictionary as it was just before, and as the revert left it.
 */
export function revertObjects(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  objects: readonly CapturedObject[],
): CapturedObject[] {
  const redo = captureBefore(runtime, session, objects);
  const docPtr = session.requireDocPtr();
  for (const object of objects) {
    if (object.before) importDict(runtime, docPtr, object.before);
  }
  session.invalidateDerived();
  return captureAfter(runtime, session, redo);
}

/** The capture of a dictionary, or null when there is none at that number. */
function tryExportDict(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  objectNumber: number,
  deep: readonly string[],
): Uint8Array | null {
  try {
    return exportDict(runtime, session.requireDocPtr(), objectNumber, deep);
  } catch (error) {
    if (EngineError.is(error)) return null;
    throw error;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
