import type {
  DocMdpPermission,
  FieldLockSpec,
  PdfRevision,
  RevisionField,
  RevisionStructure,
  SignatureCoverage,
  SignatureDTO,
  SignatureSeedValue,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { withScratch, withScratchN } from '../../../runtime/memory/scratch';
import { readUtf16String } from '../../../runtime/memory/strings';
import { U64_BYTES, peekU64, pokeU64 } from '../../../runtime/memory/u64';
import { readFormSnapshot, widgetPageRef } from '../../forms/internal/readFormSnapshot';

// Mirrors public/epdf_signature.h.
const KIND_DOC_TIMESTAMP = 1;
const COVERAGE_BY_CODE: Record<number, SignatureCoverage> = {
  0: 'whole-revision',
  1: 'partial',
  2: 'malformed',
};
const STRING_FILTER = 0;
const STRING_SUBFILTER = 1;
const STRING_NAME = 2;
const STRING_REASON = 3;
const STRING_LOCATION = 4;
const STRING_CONTACT_INFO = 5;
const STRING_M = 6;
const FIELD_ACTION_BY_CODE: Record<number, FieldLockSpec['action']> = {
  1: 'all',
  2: 'include',
  3: 'exclude',
};
const FIELDS_FIELDMDP = 0;
const FIELDS_LOCK = 1;
const SV_V = 1 << 2;
const SV_LEGAL_ATTESTATION = 1 << 4;
const SV_ADD_REV_INFO = 1 << 5;
const SV_LOCK_DOCUMENT = 1 << 7;
const SV_APPEARANCE_FILTER = 1 << 8;
const SV_MDP = 1 << 17;
const SV_LIST_SUBFILTER = 0;
const SV_LIST_DIGEST_METHOD = 1;
const SV_LIST_REASONS = 2;
/** The PDF 1.7 seed-value entry set this engine implements. */
const SUPPORTED_SEED_VALUE_VERSION = 2;
const SV_UNSUPPORTED_REQUIRED =
  SV_LEGAL_ATTESTATION | SV_ADD_REV_INFO | SV_LOCK_DOCUMENT | SV_APPEARANCE_FILTER;

function readWide(
  runtime: PdfRuntimeModule,
  call: (buf: Ptr, capacity: number) => number,
): string | null {
  return readUtf16String(runtime.mem, call, '');
}

function isPermission(value: number): value is DocMdpPermission {
  return value === 1 || value === 2 || value === 3;
}

export function readByteRange(
  runtime: PdfRuntimeModule,
  model: Ptr,
  index: number,
): [number, number, number, number] | null {
  const { fn, mem } = runtime;
  return withScratch(mem, 4 * U64_BYTES, (ptr) => {
    for (let k = 0; k < 4; k++) pokeU64(mem, ptr, 0, k * U64_BYTES);
    if (!fn.EPDFSig_GetByteRange(model, index, ptr)) return null;
    return [
      peekU64(mem, ptr, 0),
      peekU64(mem, ptr, U64_BYTES),
      peekU64(mem, ptr, 2 * U64_BYTES),
      peekU64(mem, ptr, 3 * U64_BYTES),
    ];
  });
}

function readLock(
  runtime: PdfRuntimeModule,
  model: Ptr,
  index: number,
  which: number,
): FieldLockSpec | null {
  const { fn } = runtime;
  const code =
    which === FIELDS_LOCK
      ? fn.EPDFSig_GetLockAction(model, index)
      : fn.EPDFSig_GetFieldMDPAction(model, index);
  const action = FIELD_ACTION_BY_CODE[code];
  if (!action) return null;
  const fields: string[] = [];
  const count = fn.EPDFSig_GetFieldNameCount(model, index, which);
  for (let n = 0; n < count; n++) {
    fields.push(
      readWide(runtime, (buf, cap) =>
        fn.EPDFSig_GetFieldNameAt(model, index, which, n, buf, cap),
      ) ?? '',
    );
  }
  const spec: FieldLockSpec = { action, fields };
  if (which === FIELDS_LOCK) {
    const permission = fn.EPDFSig_GetLockPermission(model, index);
    if (isPermission(permission)) spec.permission = permission;
  }
  return spec;
}

function readSeedValue(
  runtime: PdfRuntimeModule,
  model: Ptr,
  index: number,
): SignatureSeedValue | null {
  const { fn } = runtime;
  if (!fn.EPDFSig_HasSeedValue(model, index)) return null;
  const requiredFlags = fn.EPDFSig_GetSeedValueRequiredFlags(model, index) >>> 0;
  const presentFlags = fn.EPDFSig_GetSeedValuePresentFlags(model, index) >>> 0;
  const version = fn.EPDFSig_GetSeedValueVersion(model, index);
  const mdp = fn.EPDFSig_GetSeedValueMDP(model, index);
  const list = (which: number): string[] => {
    const count = fn.EPDFSig_GetSeedValueListCount(model, index, which);
    const items: string[] = [];
    for (let n = 0; n < count; n++) {
      items.push(
        readWide(runtime, (buf, cap) =>
          fn.EPDFSig_GetSeedValueListAt(model, index, which, n, buf, cap),
        ) ?? '',
      );
    }
    return items;
  };
  return {
    requiredFlags,
    presentFlags,
    version: version > 0 ? version : null,
    mdp: (presentFlags & SV_MDP) !== 0 && mdp >= 0 && mdp <= 3 ? (mdp as 0 | 1 | 2 | 3) : null,
    filter: readWide(runtime, (buf, cap) => fn.EPDFSig_GetSeedValueFilter(model, index, buf, cap)),
    subFilters: list(SV_LIST_SUBFILTER),
    digestMethods: list(SV_LIST_DIGEST_METHOD),
    reasons: list(SV_LIST_REASONS),
    unsupportedRequired:
      (requiredFlags & SV_UNSUPPORTED_REQUIRED) !== 0 ||
      ((requiredFlags & SV_V) !== 0 && version > SUPPORTED_SEED_VALUE_VERSION),
  };
}

/** Every signature field of a native signature model, in model order. */
export function readSignaturesFromModel(runtime: PdfRuntimeModule, model: Ptr): SignatureDTO[] {
  const { fn } = runtime;
  const count = fn.EPDFSig_Count(model);
  const out: SignatureDTO[] = [];
  const str = (i: number, key: number) =>
    readWide(runtime, (buf, cap) => fn.EPDFSig_GetString(model, i, key, buf, cap));
  for (let i = 0; i < count; i++) {
    const signed = fn.EPDFSig_IsSigned(model, i);
    const widgetObjNum = fn.EPDFSig_GetWidgetObjNum(model, i);
    const revisionIndex = fn.EPDFSig_GetRevisionIndex(model, i);
    const docMdp = fn.EPDFSig_GetDocMDPPermission(model, i);
    out.push({
      index: i,
      field: { kind: 'objectNumber', fieldObjectNumber: fn.EPDFSig_GetFieldObjNum(model, i) },
      fieldName: readWide(runtime, (buf, cap) => fn.EPDFSig_GetFieldName(model, i, buf, cap)) ?? '',
      widget:
        widgetObjNum > 0
          ? {
              annotObjectNumber: widgetObjNum,
              page: widgetPageRef(fn.EPDFSig_GetWidgetPageObjNum(model, i)),
            }
          : null,
      signed,
      kind: fn.EPDFSig_GetKind(model, i) === KIND_DOC_TIMESTAMP ? 'timestamp' : 'signature',
      filter: str(i, STRING_FILTER),
      subFilter: str(i, STRING_SUBFILTER),
      byteRange: signed ? readByteRange(runtime, model, i) : null,
      contentsSize: signed ? Math.max(0, fn.EPDFSig_GetContents(model, i, NULL_PTR, 0)) : 0,
      coverage: signed ? (COVERAGE_BY_CODE[fn.EPDFSig_GetCoverage(model, i)] ?? 'malformed') : null,
      revisionIndex: signed && revisionIndex >= 0 ? revisionIndex : null,
      signer: {
        name: str(i, STRING_NAME),
        reason: str(i, STRING_REASON),
        location: str(i, STRING_LOCATION),
        contactInfo: str(i, STRING_CONTACT_INFO),
        claimedTime: str(i, STRING_M),
      },
      docMdp: isPermission(docMdp) ? docMdp : null,
      catalogCertification: fn.EPDFSig_IsCatalogCertification(model, i),
      fieldMdp: readLock(runtime, model, i, FIELDS_FIELDMDP),
      lock: readLock(runtime, model, i, FIELDS_LOCK),
      seedValue: readSeedValue(runtime, model, i),
    });
  }
  return out;
}

/** The DER `/Contents` of signature `index`, copied out; `NotFound` when unsigned or malformed. */
export function readContentsAt(runtime: PdfRuntimeModule, model: Ptr, index: number): Uint8Array {
  const { fn, mem } = runtime;
  const length = fn.EPDFSig_GetContents(model, index, NULL_PTR, 0);
  if (length <= 0) {
    throw new EngineError(
      EngineErrorCode.NotFound,
      'signature has no usable /Contents (malformed encoding)',
    );
  }
  return withScratch(mem, length, (buf) => {
    const written = fn.EPDFSig_GetContents(model, index, buf, length);
    if (written !== length) {
      throw new EngineError(EngineErrorCode.Unknown, 'failed to read signature contents');
    }
    const out = new Uint8Array(length);
    out.set(mem.readBytes(buf, length));
    return out;
  });
}

/** The chained revisions of a document, oldest first; empty when the chain is not valid. */
export function readRevisions(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  signatures: ReadonlyArray<SignatureDTO>,
): PdfRevision[] {
  const { fn, mem } = runtime;
  const count = fn.EPDFDoc_GetRevisionCount(docPtr);
  const revisions: PdfRevision[] = [];
  if (count <= 0) return revisions;
  withScratchN(mem, [U64_BYTES, U64_BYTES], ([endPtr, xrefPtr]) => {
    for (let i = 0; i < count; i++) {
      pokeU64(mem, endPtr, 0);
      pokeU64(mem, xrefPtr, 0);
      if (!fn.EPDFDoc_GetRevision(docPtr, i, endPtr, xrefPtr)) {
        throw new EngineError(EngineErrorCode.Unknown, `failed to read revision ${i}`);
      }
      const sealedBy = signatures.find((s) => s.revisionIndex === i);
      revisions.push({
        index: i,
        end: peekU64(mem, endPtr),
        xrefOffset: peekU64(mem, xrefPtr),
        signatureIndex: sealedBy ? sealedBy.index : null,
      });
    }
  });
  return revisions;
}

/** Whether any signature field of the document carries a signed value (fields alone do not count). */
export function hasSignedSignature(runtime: PdfRuntimeModule, docPtr: Ptr): boolean {
  const { fn } = runtime;
  return withSignatureModel(runtime, docPtr, (model) => {
    const count = fn.EPDFSig_Count(model);
    for (let i = 0; i < count; i++) if (fn.EPDFSig_IsSigned(model, i)) return true;
    return false;
  });
}

/** Run `body` with a fresh signature model of `docPtr`, closing it afterwards. */
export function withSignatureModel<T>(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  body: (model: Ptr) => T,
): T {
  const model = runtime.fn.EPDFSig_LoadModel(docPtr);
  if (model === NULL_PTR) {
    throw new EngineError(EngineErrorCode.Unknown, 'failed to build signature model');
  }
  try {
    return body(model);
  } finally {
    runtime.fn.EPDFSig_CloseModel(model);
  }
}

/**
 * The structure of one document (a revision prefix, usually): catalog,
 * AcroForm and page-tree object numbers, the pages, the terminal fields
 * with their widgets, and the signatures. What the rule engine needs to
 * give every changed object a role.
 */
export function readStructure(runtime: PdfRuntimeModule, docPtr: Ptr): RevisionStructure {
  const { fn, mem } = runtime;
  const [root, acroForm, pagesRoot] = withScratchN(mem, [4, 4, 4], ([r, a, p]) => {
    mem.poke(r, 'i32', 0);
    mem.poke(a, 'i32', 0);
    mem.poke(p, 'i32', 0);
    fn.EPDFDoc_GetStructureObjectNumbers(docPtr, r, a, p);
    return [
      Number(mem.peek(r, 'i32')) >>> 0,
      Number(mem.peek(a, 'i32')) >>> 0,
      Number(mem.peek(p, 'i32')) >>> 0,
    ];
  });
  const pages: number[] = [];
  const pageCount = fn.FPDF_GetPageCount(docPtr);
  for (let i = 0; i < pageCount; i++) pages.push(fn.EPDFDoc_GetPageObjectNumberByIndex(docPtr, i));

  const fields: RevisionField[] = [];
  const formModel = fn.EPDFForm_LoadModel(docPtr);
  if (formModel !== NULL_PTR) {
    try {
      const snapshot = readFormSnapshot(runtime, formModel, docPtr);
      for (const f of snapshot.fields) {
        fields.push({
          objectNumber: f.fieldObjectNumber,
          name: f.name,
          family: f.family,
          widgets: f.widgets.map((w) => w.annotObjectNumber),
          flags: f.flags.raw,
        });
      }
    } finally {
      fn.EPDFForm_CloseModel(formModel);
    }
  }
  const signatures = withSignatureModel(runtime, docPtr, (model) =>
    readSignaturesFromModel(runtime, model),
  );
  return { root, acroForm, pagesRoot, pages, fields, signatures };
}
