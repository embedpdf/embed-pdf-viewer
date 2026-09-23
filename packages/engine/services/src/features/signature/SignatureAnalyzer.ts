import type {
  AnalyzeInput,
  ChangeAnalysis,
  DocumentFieldLock,
  ModificationLevel,
  ObjectChange,
  ObjectChangeKind,
  ObjectChangeType,
  ObjectReadStatus,
  ObjectReferrer,
  PdfRevision,
  RevisionAnalysis,
  RevisionHealth,
  RevisionStructure,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import {
  assessmentOf,
  combine,
  EdgeResolver,
  EngineError,
  EngineErrorCode,
  evaluateStep,
  parsePdfValue,
  restrictionsFor,
  sameEffectiveValue,
  SIGNATURE_POLICY_VERSION,
  USAGE_INCOMPLETE,
} from '@embedpdf/engine-core/runtime';
import { deriveProtection } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { SignatureReader } from './SignatureReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import {
  CloseStack,
  openFatMemoryDocument,
} from '../../document-session/lifecycle/PdfDocumentOpener';
import { withScratch, withScratchN } from '../../runtime/memory/scratch';
import { DocumentSaver } from '../save/DocumentSaver';
import { scratchPath } from './internal/candidateStore';
import { generateUuid } from '../../shared/uuid';
import {
  readRevisions,
  readSignaturesFromModel,
  readStructure,
  withSignatureModel,
} from './internal/readSignatureModel';
import { withUtf8CString } from '../../runtime/memory/strings';

// Mirrors public/epdf_signature.h.
const CHANGE_BY_CODE: Record<number, ObjectChangeType> = { 0: 'added', 1: 'modified', 2: 'freed' };
const KIND_BY_CODE: Record<number, ObjectChangeKind> = {
  0: 'dictionary',
  1: 'stream',
  2: 'array',
  3: 'scalar',
  4: 'xref',
  5: 'objstm',
  6: 'trailer',
};
const DIFF_OLD = 0;
const DIFF_NEW = 1;
/** EPDF_DIFF_READ_OK / failed / absent. */
const READ_BY_CODE: Record<number, ObjectReadStatus> = { 0: 'ok', 1: 'failed', 2: 'absent' };

/** The objects an edge may be anchored at: the trailer, the structure of the revision, and every changed object. */
function anchorSet(s: RevisionStructure, changed: ReadonlySet<number>): Set<number> {
  const out = new Set<number>([0, s.root, s.pagesRoot, ...s.pages, ...changed]);
  if (s.acroForm) out.add(s.acroForm);
  for (const f of s.fields) {
    out.add(f.objectNumber);
    for (const w of f.widgets) out.add(w);
  }
  return out;
}

/**
 * Modification analysis over a session: which revisions to compare, the
 * fork's exact object diff for each adjacent pair, each revision's
 * structure, and the pure rule engine's verdict per step. Every revision
 * is opened as its own prefix document from the target's loaded bytes;
 * `working-copy` first snapshots the session the way a save would.
 */
export class SignatureAnalyzer {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * The signature snapshot of the session's working copy: the unsaved
   * state snapshotted the way a save would write it, as one more revision
   * over the loaded bytes. Identical to the loaded-bytes snapshot when
   * nothing is unsaved.
   */
  readWorkingCopySnapshot(): SignatureSnapshot {
    const stack = new CloseStack();
    try {
      const copy = this.openWorkingCopy(stack);
      if (copy.source === 'loaded') {
        return new SignatureReader(this.runtime, this.session).readSnapshot();
      }
      const target = copy.target;
      return withSignatureModel(this.runtime, target, (model) => {
        const chainValid = this.runtime.fn.EPDFSig_IsRevisionChainValid(model);
        const signatures = readSignaturesFromModel(this.runtime, model);
        const revisions = chainValid ? readRevisions(this.runtime, target, signatures) : [];
        return { chainValid, revisions, signatures, protection: deriveProtection(signatures) };
      });
    } finally {
      stack.close();
    }
  }

  analyze(input: AnalyzeInput): ChangeAnalysis {
    const reader = new SignatureReader(this.runtime, this.session);
    const snapshot = reader.readSnapshot();
    const version = reader.version();
    const mode = input.exploratoryLevel ? 'exploratory' : 'authoritative';
    const detail = input.detail ?? 'summary';
    // Which bytes are judged, truthfully: the working copy only when a save
    // would change the document — the saver's pass decides that once the
    // working copy is opened below (an annotation added and removed again
    // leaves the loaded bytes as the document); otherwise the loaded bytes.
    let basisSource: 'persisted' | 'working-copy' = 'persisted';
    const editsVersion = this.session.mutationSeq();

    let sinceRevision: number;
    let sinceSignature: number | null = null;
    if ('signatureIndex' in input.since) {
      const sig = snapshot.signatures[input.since.signatureIndex];
      if (!sig) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `no signature ${input.since.signatureIndex}`,
        );
      }
      if (!sig.signed || sig.revisionIndex === null) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `signature ${input.since.signatureIndex} seals no whole revision; nothing to analyze from`,
        );
      }
      sinceRevision = sig.revisionIndex;
      sinceSignature = sig.index;
    } else {
      sinceRevision = input.since.revisionIndex;
    }
    if (!snapshot.chainValid) {
      const current = {
        verdict: 'indeterminate' as const,
        complete: false,
        findings: [
          {
            rule: 'revision-chain',
            verdict: 'incomplete' as const,
            objectNumber: 0,
            detail: 'the cross-reference chain is broken or was rebuilt: no revision can be told from another',
          },
        ],
        method: 'net-state' as const,
      };
      return {
        mode,
        policyVersion: SIGNATURE_POLICY_VERSION,
        basis: { version, editsVersion, source: 'persisted' },
        since: { revisionIndex: sinceRevision, signatureIndex: sinceSignature },
        until: { revisionIndex: sinceRevision },
        restrictions: [],
        current: { ...current, primary: current.findings[0] },
        later: { revisionCount: 0, undoneObjectNumbers: [] },
        verdict: 'indeterminate',
        steps: [],
      };
    }
    if (
      !Number.isInteger(sinceRevision) ||
      sinceRevision < 0 ||
      sinceRevision >= snapshot.revisions.length
    ) {
      throw new EngineError(EngineErrorCode.InvalidArg, `no revision ${sinceRevision}`);
    }

    const stack = new CloseStack();
    try {
      // The target: the loaded bytes, or a snapshot of the unsaved state.
      let target = this.session.requireDocPtr();
      let revisions: PdfRevision[] = snapshot.revisions;
      const copy = input.until === 'working-copy' ? this.openWorkingCopy(stack) : null;
      if (copy && copy.source === 'working-copy') {
        basisSource = 'working-copy';
        target = copy.target;
        const signatures = withSignatureModel(this.runtime, target, (m) =>
          readSignaturesFromModel(this.runtime, m),
        );
        revisions = readRevisions(this.runtime, target, signatures);
        if (revisions.length === 0) {
          throw new EngineError(
            EngineErrorCode.MalformedPdf,
            'the working copy has no valid revision chain',
          );
        }
      }
      let untilRevision = revisions.length - 1;
      if (typeof input.until === 'object') {
        untilRevision = input.until.revisionIndex;
        if (
          !Number.isInteger(untilRevision) ||
          untilRevision < sinceRevision ||
          untilRevision >= revisions.length
        ) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            `no revision ${untilRevision} at or after ${sinceRevision}`,
          );
        }
      }

      // The two revisions that decide the verdict: the sealed one and the
      // judged one, opened as their own prefix documents from the target's
      // bytes (the judged one is the target when it is the last revision).
      // Nothing in between is opened for the net state.
      const pair = new CloseStack();
      let before: RevisionStructure;
      let after: RevisionStructure;
      let changes: ObjectChange[] = [];
      let health: { old: RevisionHealth; new: RevisionHealth } | undefined;
      try {
        const sealed = this.openPrefix(target, revisions, sinceRevision, pair);
        const judged =
          untilRevision === revisions.length - 1
            ? target
            : this.openPrefix(target, revisions, untilRevision, pair);
        before = readStructure(this.runtime, sealed);
        after = untilRevision === sinceRevision ? before : readStructure(this.runtime, judged);
        if (untilRevision > sinceRevision) {
          ({ changes, health } = this.compare(sealed, judged, before, after));
        }
      } finally {
        pair.close();
      }

      const judgedSignature =
        sinceSignature === null ? null : (before.signatures[sinceSignature] ?? null);
      const restrictions = restrictionsFor(before, judgedSignature);
      const levelOverride = input.exploratoryLevel as ModificationLevel | undefined;
      const net = evaluateStep({
        older: sinceRevision,
        newer: untilRevision,
        changes,
        before,
        after,
        health,
        restrictions: { level: restrictions.level, locks: restrictions.locks },
        levelOverride,
      });

      // A certification's window is also replayed revision by revision
      // (corpus v3/82-83): an intermediate violation invalidates it even
      // when the final state no longer shows it. Approval and lock windows
      // are judged on their net state alone (v2/15, 42, 44; v3/81, 85).
      const certifies = restrictions.anchors.some((r) => r.source === 'docmdp' && r.own);
      const intermediate = untilRevision - sinceRevision;
      let steps: RevisionAnalysis[];
      if (intermediate <= 1) {
        steps = intermediate === 1 ? [net] : [];
      } else if (certifies || detail === 'full') {
        steps = this.walkSteps(target, revisions, sinceRevision, untilRevision, before, {
          level: restrictions.level,
          locks: restrictions.locks,
          levelOverride,
        });
      } else {
        steps = [];
      }
      const current = certifies
        ? { ...combine(net, steps), method: 'net-state+replay' as const }
        : { ...assessmentOf(net), method: 'net-state' as const };
      return {
        mode,
        policyVersion: SIGNATURE_POLICY_VERSION,
        basis: { version, editsVersion, source: basisSource },
        since: { revisionIndex: sinceRevision, signatureIndex: sinceSignature },
        until: { revisionIndex: untilRevision },
        restrictions: restrictions.anchors,
        current,
        later: {
          revisionCount: intermediate,
          undoneObjectNumbers: changes.filter(sameEffectiveValue).map((c) => c.objectNumber),
        },
        verdict: current.verdict,
        steps,
      };
    } finally {
      stack.close();
    }
  }

  /** Revision `index` of `target`'s bytes as its own document, owned by `stack`. */
  private openPrefix(target: Ptr, revisions: PdfRevision[], index: number, stack: CloseStack): Ptr {
    const prefix = this.runtime.fn.EPDFDoc_OpenRevision(target, BigInt(revisions[index].end));
    if (prefix === NULL_PTR) {
      throw new EngineError(EngineErrorCode.MalformedPdf, `revision ${index} does not open as a document`);
    }
    stack.push(() => this.runtime.fn.FPDF_CloseDocument(prefix));
    return prefix;
  }

  /**
   * Every pairwise step between `since` and `until`, two prefix documents
   * open at a time whatever the revision count. `sealedStructure` is the
   * structure of `since` (already read); every later structure is read once
   * and dropped with its document.
   */
  private walkSteps(
    target: Ptr,
    revisions: PdfRevision[],
    since: number,
    until: number,
    sealedStructure: RevisionStructure,
    restrictions: { level: ModificationLevel; locks: DocumentFieldLock[]; levelOverride?: ModificationLevel },
  ): RevisionAnalysis[] {
    const { fn } = this.runtime;
    const steps: RevisionAnalysis[] = [];
    let older = this.openPrefix(target, revisions, since, new CloseStack());
    let olderStructure = sealedStructure;
    try {
      for (let r = since + 1; r <= until; r++) {
        const newer = r === revisions.length - 1 ? target : this.openPrefix(target, revisions, r, new CloseStack());
        try {
          const newerStructure = readStructure(this.runtime, newer);
          const { changes, health } = this.compare(older, newer, olderStructure, newerStructure);
          steps.push(
            evaluateStep({
              older: r - 1,
              newer: r,
              changes,
              before: olderStructure,
              after: newerStructure,
              health,
              restrictions: { level: restrictions.level, locks: restrictions.locks },
              levelOverride: restrictions.levelOverride,
            }),
          );
          olderStructure = newerStructure;
        } finally {
          fn.FPDF_CloseDocument(older);
          older = newer;
        }
      }
    } finally {
      if (older !== target) fn.FPDF_CloseDocument(older);
    }
    return steps;
  }

  /**
   * The document as a save would write it, opened read-only, and whose
   * bytes that is. `loaded`: nothing was mutated since load, or the saver's
   * pass found no reachable object that differs from its loaded version —
   * the session's own document is the working copy. `working-copy`: a
   * layer session composes its immutable base with the cumulative delta
   * the pass emits (`EPDFDoc_OpenBaseOverlay`: no copy of the base, one
   * cross-reference parse, the loaded delta's revision replaced, as an
   * artifact is), or — when every edit brought the layer back to its base
   * — a fresh layer over that base; a plain session (unsigned by law 9, so
   * this is exploratory) materialises a standalone incremental save and
   * opens it whole.
   */
  private openWorkingCopy(stack: CloseStack): { target: Ptr; source: 'loaded' | 'working-copy' } {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    if (!this.session.hasUnsavedEdits()) return { target: docPtr, source: 'loaded' };
    const saver = new DocumentSaver(this.runtime, this.session);
    if (this.session.kind === 'layer') {
      const base = this.session.source.base;
      if (saver.canWriteScratchFiles() && base?.kind === 'file') {
        // The delta on disk, composed over the base in place: no buffer of
        // the delta, no copy of it. The file is owned from the moment it is
        // named and goes with the stack, whatever happens next.
        const path = scratchPath(base.path, 'working-copy', generateUuid(), 'delta');
        stack.push(() => this.runtime.fileWrite.removeFile(path));
        const delta = saver.saveLayerDeltaToFileEx(path);
        if (!delta.changedSinceLoad) return { target: docPtr, source: 'loaded' };
        if (this.runtime.fileAccess.sizeOf(path) === 0) return this.freshLayerOverBase(stack);
        const overlay = withUtf8CString(mem, path, (pathPtr) =>
          fn.EPDFDoc_OpenBaseOverlayFromPath(docPtr, pathPtr),
        );
        if (overlay === NULL_PTR) {
          throw new EngineError(
            EngineErrorCode.MalformedPdf,
            'the working copy does not compose with its base',
          );
        }
        stack.push(() => fn.FPDF_CloseDocument(overlay)); // closes before the file goes (LIFO)
        return { target: overlay, source: 'working-copy' };
      }
      const delta = saver.saveLayerDeltaEx();
      if (!delta.changedSinceLoad) return { target: docPtr, source: 'loaded' };
      if (delta.size === 0) return this.freshLayerOverBase(stack);
      const bytes = new Uint8Array(delta.bytes);
      const ptr = mem.alloc(bytes.byteLength);
      try {
        mem.writeBytes(ptr, bytes);
        const overlay = fn.EPDFDoc_OpenBaseOverlay(docPtr, ptr, bytes.byteLength);
        if (overlay === NULL_PTR) {
          throw new EngineError(
            EngineErrorCode.MalformedPdf,
            'the working copy does not compose with its base',
          );
        }
        stack.push(() => fn.FPDF_CloseDocument(overlay));
        return { target: overlay, source: 'working-copy' };
      } finally {
        mem.free(ptr);
      }
    }
    const saved = saver.saveStandaloneToBufferEx('incremental');
    if (saved.unchangedSinceLoad) return { target: docPtr, source: 'loaded' };
    const opened = openFatMemoryDocument(
      this.runtime,
      new Uint8Array(saved.bytes),
      this.session.password,
    );
    stack.push(() => opened.close());
    return { target: opened.docPtr, source: 'working-copy' };
  }

  /** Changed since load, nothing to write: the layer equals its base, and a fresh layer over it is that document. */
  private freshLayerOverBase(stack: CloseStack): { target: Ptr; source: 'working-copy' } {
    const { fn, mem } = this.runtime;
    const base = fn.EPDFLayer_GetBaseDocument(this.session.requireDocPtr());
    const statusPtr = mem.alloc(4);
    try {
      mem.poke(statusPtr, 'i32', -1);
      const fresh = fn.EPDFLayer_OpenLayer(base, NULL_PTR, this.session.password ?? '', statusPtr);
      if (fresh === NULL_PTR || Number(mem.peek(statusPtr, 'i32')) !== 0) {
        throw new EngineError(
          EngineErrorCode.MalformedPdf,
          'the working copy could not be opened over its base',
        );
      }
      stack.push(() => fn.FPDF_CloseDocument(fresh));
      return { target: fresh, source: 'working-copy' };
    } finally {
      mem.free(statusPtr);
    }
  }

  /**
   * The fork's exact object diff between two revision documents,
   * marshalled: values in pass one, anchored edges in pass two (the anchors
   * are the changed objects plus each side's structural objects).
   */
  private compare(
    older: Ptr,
    newer: Ptr,
    before: RevisionStructure,
    after: RevisionStructure,
  ): { changes: ObjectChange[]; health: { old: RevisionHealth; new: RevisionHealth } } {
    const { fn, mem } = this.runtime;
    const diff = fn.EPDFDoc_CompareRevisions(older, newer);
    if (diff === NULL_PTR) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        'the revisions do not share a byte history',
      );
    }
    try {
      const count = fn.EPDFObjectDiff_GetCount(diff);
      const changes: ObjectChange[] = [];
      withScratchN(
        mem,
        [4, 4, 4, 4, 4, 4],
        ([numPtr, changePtr, kindPtr, oldGenPtr, newGenPtr, streamPtr]) => {
          for (let i = 0; i < count; i++) {
            for (const p of [numPtr, changePtr, kindPtr, oldGenPtr, newGenPtr, streamPtr])
              mem.poke(p, 'i32', 0);
            if (
              !fn.EPDFObjectDiff_GetEntry(
                diff,
                i,
                numPtr,
                changePtr,
                kindPtr,
                oldGenPtr,
                newGenPtr,
                streamPtr,
              )
            ) {
              throw new EngineError(EngineErrorCode.Unknown, `failed to read diff entry ${i}`);
            }
            const objectNumber = Number(mem.peek(numPtr, 'i32')) >>> 0;
            const oldGen = Number(mem.peek(oldGenPtr, 'i32'));
            const newGen = Number(mem.peek(newGenPtr, 'i32'));
            const oldValue = this.readValue(diff, i, DIFF_OLD);
            const newValue = this.readValue(diff, i, DIFF_NEW);
            let truncated = oldValue.truncated || newValue.truncated;
            let oldParsed = null;
            let newParsed = null;
            try {
              oldParsed =
                oldValue.text === null || oldValue.truncated ? null : parsePdfValue(oldValue.text);
              newParsed =
                newValue.text === null || newValue.truncated ? null : parsePdfValue(newValue.text);
            } catch {
              // A serialisation this engine cannot read carries no evidence.
              truncated = true;
            }
            const change = CHANGE_BY_CODE[Number(mem.peek(changePtr, 'i32'))] ?? 'modified';
            changes.push({
              objectNumber,
              change,
              kind: KIND_BY_CODE[Number(mem.peek(kindPtr, 'i32'))] ?? 'scalar',
              // The trailer carries no generation numbers: presence follows the change type.
              present: { old: change !== 'added', new: change !== 'freed' },
              generation: { old: oldGen < 0 ? null : oldGen, new: newGen < 0 ? null : newGen },
              value: { old: oldParsed, new: newParsed, truncated },
              raw: { old: oldValue.text, new: newValue.text },
              // A live mapping whose bytes do not parse serialises as "null"
              // but reads as failed: the evaluator treats that as missing
              // evidence, never as a value equal to another failed read.
              read: {
                old: READ_BY_CODE[fn.EPDFObjectDiff_GetReadStatus(diff, i, DIFF_OLD)] ?? 'failed',
                new: READ_BY_CODE[fn.EPDFObjectDiff_GetReadStatus(diff, i, DIFF_NEW)] ?? 'failed',
              },
              streamDataChanged: Number(mem.peek(streamPtr, 'i32')) !== 0,
              usage: { old: [], new: [] },
            });
          }
        },
      );
      return {
        changes: this.withAnchoredUsage(diff, changes, before, after),
        health: { old: this.readHealth(diff, DIFF_OLD), new: this.readHealth(diff, DIFF_NEW) },
      };
    } finally {
      fn.EPDFObjectDiff_Close(diff);
    }
  }

  /** What the fork learned about one revision as a whole (see `RevisionHealth`). */
  private readHealth(diff: Ptr, which: number): RevisionHealth {
    const { fn, mem } = this.runtime;
    return withScratchN(mem, [4, 4, 4], ([sparsePtr, barePtr, completePtr]) => {
      for (const p of [sparsePtr, barePtr, completePtr]) mem.poke(p, 'i32', 0);
      if (!fn.EPDFObjectDiff_GetRevisionHealth(diff, which, sparsePtr, barePtr, completePtr)) {
        throw new EngineError(EngineErrorCode.Unknown, 'failed to read revision health');
      }
      return {
        sparseXref: Number(mem.peek(sparsePtr, 'i32')) !== 0,
        bareReferences: Number(mem.peek(barePtr, 'i32')) >>> 0,
        referrersComplete: Number(mem.peek(completePtr, 'i32')) !== 0,
      };
    });
  }

  /**
   * Pass two: every changed object's inbound edges, resolved through
   * unchanged non-structural objects to the nearest anchor (the fork's
   * referrer index covers every reachable object, so the walk never leaves
   * the diff). An object whose edges exceed the resolver's budget is
   * marked `usageIncomplete` and the evaluator refuses to permit it.
   */
  private withAnchoredUsage(
    diff: Ptr,
    changes: ObjectChange[],
    before: RevisionStructure,
    after: RevisionStructure,
  ): ObjectChange[] {
    const changed = new Set(changes.map((c) => c.objectNumber));
    const resolvers = {
      old: new EdgeResolver(
        (n) => this.readReferrers(diff, DIFF_OLD, n),
        anchorSet(before, changed),
      ),
      new: new EdgeResolver(
        (n) => this.readReferrers(diff, DIFF_NEW, n),
        anchorSet(after, changed),
      ),
    };
    return changes.map((c) => {
      const old = c.present.old ? resolvers.old.resolve(c.objectNumber) : [];
      const now = c.present.new ? resolvers.new.resolve(c.objectNumber) : [];
      const incomplete = old === USAGE_INCOMPLETE || now === USAGE_INCOMPLETE;
      return {
        ...c,
        usage: {
          old: old === USAGE_INCOMPLETE ? [] : old,
          new: now === USAGE_INCOMPLETE ? [] : now,
        },
        ...(incomplete ? { usageIncomplete: true } : {}),
      };
    });
  }

  private readValue(
    diff: Ptr,
    index: number,
    which: number,
  ): { text: string | null; truncated: boolean } {
    const { fn, mem } = this.runtime;
    return withScratch(mem, 4, (truncPtr) => {
      mem.poke(truncPtr, 'i32', 0);
      const length = fn.EPDFObjectDiff_GetValue(diff, index, which, NULL_PTR, 0, truncPtr);
      // A value past the fork's inspection cap reports length 0 with the flag set: read it first.
      const truncatedProbe = Number(mem.peek(truncPtr, 'i32')) !== 0;
      if (length <= 0) return { text: null, truncated: truncatedProbe };
      return withScratch(mem, length, (buf) => {
        mem.poke(truncPtr, 'i32', 0);
        const written = fn.EPDFObjectDiff_GetValue(diff, index, which, buf, length, truncPtr);
        const truncated = Number(mem.peek(truncPtr, 'i32')) !== 0;
        if (written <= 0) return { text: null, truncated };
        // Bytes, one to one: the serialisation may carry binary string data.
        const bytes = mem.readBytes(buf, written - 1);
        let text = '';
        for (const b of bytes) text += String.fromCharCode(b);
        return { text, truncated };
      });
    });
  }

  private readReferrers(diff: Ptr, which: number, objectNumber: number): ObjectReferrer[] {
    const { fn, mem } = this.runtime;
    const count = fn.EPDFObjectDiff_GetReferrerCount(diff, which, objectNumber);
    const out: ObjectReferrer[] = [];
    if (count <= 0) return out;
    withScratch(mem, 4, (parentPtr) => {
      for (let k = 0; k < count; k++) {
        mem.poke(parentPtr, 'i32', 0);
        const length = fn.EPDFObjectDiff_GetReferrer(
          diff,
          which,
          objectNumber,
          k,
          parentPtr,
          NULL_PTR,
          0,
        );
        const label =
          length <= 0
            ? ''
            : withScratch(mem, length, (buf) => {
                const written = fn.EPDFObjectDiff_GetReferrer(
                  diff,
                  which,
                  objectNumber,
                  k,
                  parentPtr,
                  buf,
                  length,
                );
                if (written <= 0) return '';
                const bytes = mem.readBytes(buf, written - 1);
                let text = '';
                for (const b of bytes) text += String.fromCharCode(b);
                return text;
              });
        out.push({ parent: Number(mem.peek(parentPtr, 'i32')) >>> 0, label });
      }
    });
    return out;
  }
}
