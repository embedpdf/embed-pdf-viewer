import type {
  SignatureSnapshot,
  AnalyzeInput,
  ChangeAnalysis,
  ModificationLevel,
  ObjectChange,
  ObjectChangeKind,
  ObjectChangeType,
  ObjectReferrer,
  PdfRevision,
  RevisionAnalysis,
  RevisionStructure,
} from '@embedpdf/engine-core/runtime';
import {
  EdgeResolver,
  EngineError,
  EngineErrorCode,
  SIGNATURE_POLICY_VERSION,
  USAGE_INCOMPLETE,
  evaluateStep,
  parsePdfValue,
  worstVerdict,
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
import {
  readRevisions,
  readSignaturesFromModel,
  readStructure,
  withSignatureModel,
} from './internal/readSignatureModel';

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
    if (!this.session.hasUnsavedEdits()) {
      return new SignatureReader(this.runtime, this.session).readSnapshot();
    }
    const stack = new CloseStack();
    try {
      const target = this.openWorkingCopy(stack);
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
    const basisSource = input.until === 'working-copy' ? 'working-copy' : 'persisted';
    const basis = {
      version,
      editsVersion: this.session.mutationSeq(),
      source: basisSource,
    } as const;

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
      return {
        mode,
        policyVersion: SIGNATURE_POLICY_VERSION,
        basis,
        since: { revisionIndex: sinceRevision, signatureIndex: sinceSignature },
        until: { revisionIndex: sinceRevision },
        steps: [],
        verdict: 'indeterminate',
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
      if (input.until === 'working-copy' && this.session.hasUnsavedEdits()) {
        target = this.openWorkingCopy(stack);
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

      // One prefix document per revision, oldest first.
      const prefixes: Ptr[] = [];
      const structures: RevisionStructure[] = [];
      for (let r = sinceRevision; r <= untilRevision; r++) {
        const prefix = this.runtime.fn.EPDFDoc_OpenRevision(target, BigInt(revisions[r].end));
        if (prefix === NULL_PTR) {
          throw new EngineError(
            EngineErrorCode.MalformedPdf,
            `revision ${r} does not open as a document`,
          );
        }
        stack.push(() => this.runtime.fn.FPDF_CloseDocument(prefix));
        prefixes.push(prefix);
        structures.push(readStructure(this.runtime, prefix));
      }

      const steps: RevisionAnalysis[] = [];
      for (let i = 0; i + 1 < prefixes.length; i++) {
        const changes = this.compare(
          prefixes[i],
          prefixes[i + 1],
          structures[i],
          structures[i + 1],
        );
        steps.push(
          evaluateStep({
            older: sinceRevision + i,
            newer: sinceRevision + i + 1,
            changes,
            before: structures[i],
            after: structures[i + 1],
            levelOverride: input.exploratoryLevel as ModificationLevel | undefined,
          }),
        );
      }
      return {
        mode,
        policyVersion: SIGNATURE_POLICY_VERSION,
        basis,
        since: { revisionIndex: sinceRevision, signatureIndex: sinceSignature },
        until: { revisionIndex: untilRevision },
        steps,
        verdict: worstVerdict(steps),
      };
    } finally {
      stack.close();
    }
  }

  /**
   * The unsaved state as the bytes a save would write, opened read-only.
   * A layer session composes its immutable base with the cumulative delta
   * the layer serializer emits (`EPDFDoc_OpenBaseOverlay`): no copy of the
   * base, one cross-reference parse, and a revision list that is the base's
   * plus one — the loaded delta's revision REPLACED, as an artifact is. A
   * plain session (unsigned by law 9, so this is exploratory) still
   * materialises a standalone incremental save and opens it whole.
   */
  private openWorkingCopy(stack: CloseStack): Ptr {
    const { fn, mem } = this.runtime;
    const saver = new DocumentSaver(this.runtime, this.session);
    if (this.session.kind === 'layer') {
      const delta = new Uint8Array(saver.saveLayerDelta().bytes);
      if (delta.byteLength === 0) return this.session.requireDocPtr();
      const ptr = mem.alloc(delta.byteLength);
      try {
        mem.writeBytes(ptr, delta);
        const overlay = fn.EPDFDoc_OpenBaseOverlay(
          this.session.requireDocPtr(),
          ptr,
          delta.byteLength,
        );
        if (overlay === NULL_PTR) {
          throw new EngineError(
            EngineErrorCode.MalformedPdf,
            'the working copy does not compose with its base',
          );
        }
        stack.push(() => fn.FPDF_CloseDocument(overlay));
        return overlay;
      } finally {
        mem.free(ptr);
      }
    }
    const bytes = saver.saveStandaloneToBuffer('incremental').bytes;
    const opened = openFatMemoryDocument(
      this.runtime,
      new Uint8Array(bytes),
      this.session.password,
    );
    stack.push(() => opened.close());
    return opened.docPtr;
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
  ): ObjectChange[] {
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
              streamDataChanged: Number(mem.peek(streamPtr, 'i32')) !== 0,
              usage: { old: [], new: [] },
            });
          }
        },
      );
      return this.withAnchoredUsage(diff, changes, before, after);
    } finally {
      fn.EPDFObjectDiff_Close(diff);
    }
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
      // A value past the fork's inspection cap reports length 0 WITH the flag set: read it first.
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
