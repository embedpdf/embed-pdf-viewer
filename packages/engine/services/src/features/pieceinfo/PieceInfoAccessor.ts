import {
  EngineError,
  EngineErrorCode,
  type PageObjectNumber,
  type PieceInfoEntry,
  type PieceInfoPatch,
  type PieceInfoSnapshot,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { readUtf8String, readUtf16String, writeUtf16String } from '../../runtime/memory/strings';
import { throwIfAborted } from '../../shared/abort';
import { formatPdfDate, pdfDateToIso } from '../../shared/pdf-date';
import { withWideStringArray } from '../forms/internal/wideStringArray';

// FPDF_OBJECT_* codes reported by EPDFDoc_Get(Page)PieceInfoValueType.
const OBJ_BOOLEAN = 1;
const OBJ_NUMBER = 2;
const OBJ_STRING = 3;
const OBJ_NAME = 4;
const OBJ_ARRAY = 5;

/**
 * `/PieceInfo` reads and writes for one holder — the document CATALOG
 * (`pageObjectNumber` undefined) or one PAGE. Wraps the fork's symmetric
 * `EPDFDoc_*PieceInfo*` / `EPDFDoc_*PagePieceInfo*` families behind one
 * shape, so the worker host has a single code path for both levels.
 *
 * Writes stamp `content_last_modified` once per job (the worker is
 * single-threaded, so every key written by one job gets one revision date);
 * the native side fans it out to the application dict, the page dict,
 * and — for catalog writes — /Info /ModDate.
 */
export class PieceInfoAccessor {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    private readonly pageObjectNumber?: PageObjectNumber,
  ) {
    if (pageObjectNumber !== undefined) {
      // NotFound on a bad pon — same fail-fast as every page verb.
      session.recordByObjectNumber(pageObjectNumber);
    }
  }

  read(application: string, signal: AbortSignal): PieceInfoSnapshot | null {
    throwIfAborted(signal);
    requireApplication(application);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pon = this.pageObjectNumber;

    const has =
      pon === undefined
        ? fn.EPDFDoc_HasPieceInfoEntry(docPtr, application)
        : fn.EPDFDoc_HasPagePieceInfoEntry(docPtr, pon, application);
    if (!has) return null;

    const keyCount =
      pon === undefined
        ? fn.EPDFDoc_GetPieceInfoKeyCount(docPtr, application)
        : fn.EPDFDoc_GetPagePieceInfoKeyCount(docPtr, pon, application);

    const entries: Record<string, PieceInfoEntry> = {};
    for (let i = 0; i < keyCount; i++) {
      throwIfAborted(signal);
      const key = readUtf8String(mem, (buf, cap) =>
        pon === undefined
          ? fn.EPDFDoc_GetPieceInfoKeyAt(docPtr, application, i, buf, cap)
          : fn.EPDFDoc_GetPagePieceInfoKeyAt(docPtr, pon, application, i, buf, cap),
      );
      if (key === null) continue;
      entries[key] = this.readEntry(application, key);
    }

    const lastModifiedPdf = readUtf16String(
      mem,
      (buf, cap) =>
        pon === undefined
          ? fn.EPDFDoc_GetPieceInfoLastModified(docPtr, application, buf, cap)
          : fn.EPDFDoc_GetPagePieceInfoLastModified(docPtr, pon, application, buf, cap),
      null,
    );
    return {
      entries,
      lastModified: lastModifiedPdf ? pdfDateToIso(lastModifiedPdf) : null,
    };
  }

  update(application: string, patch: PieceInfoPatch, signal: AbortSignal): void {
    throwIfAborted(signal);
    requireApplication(application);
    requirePatch(patch);
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    validatePatch(patch, keys);

    // This is the apply boundary. No caller-controlled validation and no
    // cancellation check belongs below it: once the first native setter runs,
    // this deliberately non-rollback-atomic patch may be partially written if
    // a native invariant fails on a later key.
    throwIfAborted(signal);

    const { mem } = this.runtime;
    // One revision date per job, however many keys the patch touches.
    const lastModified = formatPdfDate(new Date());
    const lmPtr = mem.writeU16String(lastModified);
    try {
      for (const key of keys) {
        const value = patch[key];
        const ok = this.writeEntry(application, key, value, lmPtr);
        if (!ok) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `pieceInfo write rejected for key '${key}' after validation`,
          );
        }
      }
    } finally {
      mem.free(lmPtr);
    }
  }

  applications(signal: AbortSignal): string[] {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pon = this.pageObjectNumber;
    const count =
      pon === undefined
        ? fn.EPDFDoc_GetPieceInfoEntryCount(docPtr)
        : fn.EPDFDoc_GetPagePieceInfoEntryCount(docPtr, pon);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = readUtf8String(mem, (buf, cap) =>
        pon === undefined
          ? fn.EPDFDoc_GetPieceInfoEntryAt(docPtr, i, buf, cap)
          : fn.EPDFDoc_GetPagePieceInfoEntryAt(docPtr, pon, i, buf, cap),
      );
      if (name !== null) out.push(name);
    }
    return out;
  }

  clear(application: string, signal: AbortSignal): void {
    throwIfAborted(signal);
    requireApplication(application);
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pon = this.pageObjectNumber;
    const ok =
      pon === undefined
        ? fn.EPDFDoc_ClearPieceInfoEntry(docPtr, application)
        : fn.EPDFDoc_ClearPagePieceInfoEntry(docPtr, pon, application);
    if (!ok) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `pieceInfo clear rejected for application '${application}'`,
      );
    }
  }

  private readEntry(application: string, key: string): PieceInfoEntry {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pon = this.pageObjectNumber;
    const type =
      pon === undefined
        ? fn.EPDFDoc_GetPieceInfoValueType(docPtr, application, key)
        : fn.EPDFDoc_GetPagePieceInfoValueType(docPtr, pon, application, key);

    switch (type) {
      case OBJ_STRING: {
        const value = readUtf16String(
          mem,
          (buf, cap) =>
            pon === undefined
              ? fn.EPDFDoc_GetPieceInfoString(docPtr, application, key, buf, cap)
              : fn.EPDFDoc_GetPagePieceInfoString(docPtr, pon, application, key, buf, cap),
          '',
        );
        return value === null ? { type: 'unknown' } : { type: 'string', value };
      }
      case OBJ_NAME: {
        const value = readUtf8String(mem, (buf, cap) =>
          pon === undefined
            ? fn.EPDFDoc_GetPieceInfoName(docPtr, application, key, buf, cap)
            : fn.EPDFDoc_GetPagePieceInfoName(docPtr, pon, application, key, buf, cap),
        );
        return value === null ? { type: 'unknown' } : { type: 'name', value };
      }
      case OBJ_NUMBER: {
        const outPtr = mem.alloc(4);
        try {
          const ok =
            pon === undefined
              ? fn.EPDFDoc_GetPieceInfoNumber(docPtr, application, key, outPtr)
              : fn.EPDFDoc_GetPagePieceInfoNumber(docPtr, pon, application, key, outPtr);
          if (!ok) return { type: 'unknown' };
          return { type: 'number', value: Number(mem.peek(outPtr, 'f32')) };
        } finally {
          mem.free(outPtr);
        }
      }
      case OBJ_BOOLEAN: {
        const outPtr = mem.alloc(4);
        try {
          const ok =
            pon === undefined
              ? fn.EPDFDoc_GetPieceInfoBoolean(docPtr, application, key, outPtr)
              : fn.EPDFDoc_GetPagePieceInfoBoolean(docPtr, pon, application, key, outPtr);
          if (!ok) return { type: 'unknown' };
          return { type: 'boolean', value: Number(mem.peek(outPtr, 'i32')) !== 0 };
        } finally {
          mem.free(outPtr);
        }
      }
      case OBJ_ARRAY: {
        const count =
          pon === undefined
            ? fn.EPDFDoc_GetPieceInfoStringArrayCount(docPtr, application, key)
            : fn.EPDFDoc_GetPagePieceInfoStringArrayCount(docPtr, pon, application, key);
        // -1 = not a pure text-string array — preserved, not readable here.
        if (count < 0) return { type: 'unknown' };
        const value: string[] = [];
        for (let i = 0; i < count; i++) {
          const item = readUtf16String(
            mem,
            (buf, cap) =>
              pon === undefined
                ? fn.EPDFDoc_GetPieceInfoStringArrayAt(docPtr, application, key, i, buf, cap)
                : fn.EPDFDoc_GetPagePieceInfoStringArrayAt(
                    docPtr,
                    pon,
                    application,
                    key,
                    i,
                    buf,
                    cap,
                  ),
            '',
          );
          if (item === null) return { type: 'unknown' };
          value.push(item);
        }
        return { type: 'string-array', value };
      }
      default:
        return { type: 'unknown' };
    }
  }

  private writeEntry(
    application: string,
    key: string,
    value: PieceInfoPatch[string],
    lmPtr: Ptr,
  ): boolean {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pon = this.pageObjectNumber;

    if (value === null) {
      return pon === undefined
        ? fn.EPDFDoc_ClearPieceInfoKey(docPtr, application, key, lmPtr)
        : fn.EPDFDoc_ClearPagePieceInfoKey(docPtr, pon, application, key, lmPtr);
    }
    if (typeof value === 'string') {
      return writeUtf16String(mem, value, (ptr) =>
        pon === undefined
          ? fn.EPDFDoc_SetPieceInfoString(docPtr, application, key, ptr, lmPtr)
          : fn.EPDFDoc_SetPagePieceInfoString(docPtr, pon, application, key, ptr, lmPtr),
      );
    }
    if (typeof value === 'number') {
      return pon === undefined
        ? fn.EPDFDoc_SetPieceInfoNumber(docPtr, application, key, value, lmPtr)
        : fn.EPDFDoc_SetPagePieceInfoNumber(docPtr, pon, application, key, value, lmPtr);
    }
    if (typeof value === 'boolean') {
      return pon === undefined
        ? fn.EPDFDoc_SetPieceInfoBoolean(docPtr, application, key, value, lmPtr)
        : fn.EPDFDoc_SetPagePieceInfoBoolean(docPtr, pon, application, key, value, lmPtr);
    }
    if (Array.isArray(value)) {
      return withWideStringArray(this.runtime, value, (arrayPtr, count) =>
        pon === undefined
          ? fn.EPDFDoc_SetPieceInfoStringArray(docPtr, application, key, arrayPtr, count, lmPtr)
          : fn.EPDFDoc_SetPagePieceInfoStringArray(
              docPtr,
              pon,
              application,
              key,
              arrayPtr,
              count,
              lmPtr,
            ),
      );
    }
    if (typeof value === 'object' && value !== null && 'name' in value) {
      return pon === undefined
        ? fn.EPDFDoc_SetPieceInfoName(docPtr, application, key, value.name, lmPtr)
        : fn.EPDFDoc_SetPagePieceInfoName(docPtr, pon, application, key, value.name, lmPtr);
    }
    // validatePatch() makes this unreachable. Keep a loud invariant failure
    // rather than silently ignoring a new wire value if the vocabulary grows.
    throw new EngineError(EngineErrorCode.Unknown, `unvalidated pieceInfo value for '${key}'`);
  }
}

function requireApplication(application: string): void {
  if (typeof application !== 'string' || application.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'pieceInfo application must be non-empty');
  }
}

function requirePatch(patch: PieceInfoPatch): void {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'pieceInfo patch must be an object');
  }
}

function validatePatch(patch: PieceInfoPatch, keys: string[]): void {
  for (const key of keys) {
    if (key.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pieceInfo keys must be non-empty');
    }
    validatePatchValue(key, patch[key]);
  }
}

function validatePatchValue(key: string, value: PieceInfoPatch[string]): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pieceInfo number for '${key}' must be finite`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === 'string')) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pieceInfo string array for '${key}' must contain only strings`,
      );
    }
    return;
  }

  if (typeof value === 'object' && value !== null && 'name' in value) {
    if (typeof value.name !== 'string' || value.name.length === 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pieceInfo PDF name for '${key}' must be a non-empty string`,
      );
    }
    return;
  }

  throw new EngineError(
    EngineErrorCode.InvalidArg,
    `unsupported pieceInfo value for '${key}': string | number | boolean | string[] | { name } | null`,
  );
}
