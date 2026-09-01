import type {
  ActionReadBudget,
  PdfActionNode,
  PdfActionTargetRef,
  PdfActionTree,
  PdfActionType,
  PdfActionWarning,
} from '@embedpdf/engine-core/runtime';
import {
  decodeSubmitFormFlags,
  EngineError,
  EngineErrorCode,
} from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/engine-runtime';

import { readUtf8String, readUtf16String } from '../../runtime/memory/strings';
import { withScratchN } from '../../runtime/memory/scratch';
import { I32_BYTES, readI32 } from '../../runtime/memory/structs';
import { readDestination } from '../destinations/readDestination';

const DEFAULT_ACTION_READ_BUDGET: ActionReadBudget = {
  maxModels: 512,
  maxNodes: 16_384,
  maxScriptCodeUnits: 16_000_000,
  maxTargetEntries: 4_096,
  maxPayloadCodeUnits: 262_144,
};

const ACTION_TYPE_BY_CODE: Record<number, PdfActionType> = {
  0: 'unknown',
  1: 'goto',
  2: 'goto-remote',
  3: 'goto-embedded',
  4: 'launch',
  5: 'thread',
  6: 'uri',
  7: 'sound',
  8: 'movie',
  9: 'hide',
  10: 'named',
  11: 'submit-form',
  12: 'reset-form',
  13: 'import-data',
  14: 'javascript',
  15: 'set-ocg-state',
  16: 'rendition',
  17: 'transition',
  18: 'goto-3d-view',
};

const WARNING_CYCLE_DROPPED = 0x1;
const WARNING_MALFORMED_NEXT = 0x2;
const WARNING_INCOMPLETE = 0x4;
const INVALID_NODE_U32 = 0xffff_ffff;

/** `EPDF_ANNOT_ACTION_ACTIVATE` — the `/A` slot of the per-annotation event
 *  table (the same table `readAnnotationBase` walks). */
export const ANNOT_ACTION_ACTIVATE = 0;

/** Decode one `EPDF_ACTION_TYPE_*` code — the shared vocabulary consumers
 *  use so action-shaped surfaces cannot drift. */
export function actionTypeFromCode(code: number): PdfActionType {
  return ACTION_TYPE_BY_CODE[code] ?? 'unknown';
}

/** Is this `EPDFAction_GetRootNode`/`GetNextAt` result a real node id?
 *  (`EPDF_ACTION_NODE_INVALID` may surface as -1 or u32 max via cwrap.) */
export function isValidActionNodeId(raw: number): boolean {
  return raw !== -1 && raw >>> 0 !== INVALID_NODE_U32;
}

/** Mutable aggregate budget shared by every action model in one read job.
 *  Payload budgets are RESERVED before the backing buffer is allocated. */
export class ActionReadBudgetTracker {
  private models = 0;
  private nodes = 0;
  private scriptCodeUnits = 0;
  private targetEntries = 0;
  private payloadCodeUnits = 0;

  constructor(private readonly limits: ActionReadBudget = DEFAULT_ACTION_READ_BUDGET) {}

  addModel(nodeCount: number): void {
    this.models += 1;
    this.nodes += nodeCount;
    this.assertWithinBudget();
  }

  addScript(script: string): void {
    this.scriptCodeUnits += script.length;
    this.assertWithinBudget();
  }

  /** Charge target entries BEFORE the target array is walked. */
  reserveTargets(count: number): void {
    this.targetEntries += count;
    this.assertWithinBudget();
  }

  /** Charge payload text BEFORE the scratch buffer for it is allocated. */
  reservePayloadBytes(length: number): void {
    this.payloadCodeUnits += length;
    this.assertWithinBudget();
  }

  private assertWithinBudget(): void {
    if (
      this.models > this.limits.maxModels ||
      this.nodes > this.limits.maxNodes ||
      this.scriptCodeUnits > this.limits.maxScriptCodeUnits ||
      this.targetEntries > this.limits.maxTargetEntries ||
      this.payloadCodeUnits > this.limits.maxPayloadCodeUnits
    ) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        'aggregate PDF action read budget exceeded',
        {
          details: {
            models: this.models,
            nodes: this.nodes,
            scriptCodeUnits: this.scriptCodeUnits,
            targetEntries: this.targetEntries,
            payloadCodeUnits: this.payloadCodeUnits,
            limits: this.limits,
          },
        },
      );
    }
  }
}

/**
 * Convert and close one detached native action model. This is the only
 * native-model walker used by document, page, field, and annotation reads.
 *
 * `docPtr` resolves `goto` destinations (page identity + named-destination
 * lookup); every caller reads within an open document session.
 *
 * Payload rule: a node whose payload cannot be materialised (a goto without
 * a resolvable destination, a javascript node with no `/JS`, a withheld
 * target list) degrades to `{ type: 'unknown' }` with its original `/S` on
 * `subtype`, and the tree gains the `'payload-dropped'` warning — impossible
 * states stay unrepresentable while malformed documents stay readable.
 */
export function readActionModel(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  modelPtr: Ptr,
  budget: ActionReadBudgetTracker,
): PdfActionTree | null {
  if (modelPtr === NULL_PTR) return null;
  try {
    const nodeCount = fn.EPDFAction_GetNodeCount(modelPtr);
    if (!Number.isInteger(nodeCount) || nodeCount < 0) {
      throw malformedActionModel('invalid node count', { nodeCount });
    }
    budget.addModel(nodeCount);

    const warningFlags = fn.EPDFAction_GetWarningFlags(modelPtr) >>> 0;
    const incomplete = !fn.EPDFAction_IsComplete(modelPtr);
    const rootId = normalizeOptionalNodeId(fn.EPDFAction_GetRootNode(modelPtr), nodeCount);
    const visiting = new Set<number>();
    let payloadDropped = false;

    /** Probe the two-call length first and charge the budget BEFORE the
     *  scratch buffer for the value is allocated. */
    const readPayloadString = (call: (buf: Ptr, capacity: number) => number): string | null => {
      const length = call(NULL_PTR, 0);
      if (length <= 0) return null;
      budget.reservePayloadBytes(length);
      return readUtf8String(mem, call);
    };

    const readOutBool = (read: (outPtr: Ptr) => boolean | number): boolean | null =>
      withScratchN(mem, [I32_BYTES], ([outPtr]) =>
        read(outPtr) ? readI32(mem, outPtr) !== 0 : null,
      );

    const readTargetObjectNumber = (nodeId: number, index: number): number | null =>
      withScratchN(mem, [I32_BYTES], ([outPtr]) => {
        if (!fn.EPDFAction_GetNodeTargetObjectNumber(modelPtr, nodeId, index, outPtr)) {
          return null;
        }
        const value = readI32(mem, outPtr) >>> 0;
        return value === 0 ? null : value;
      });

    const readTargets = (nodeId: number, count: number): PdfActionTargetRef[] | null => {
      const targets: PdfActionTargetRef[] = [];
      for (let index = 0; index < count; index++) {
        const name = readPayloadString((buf, capacity) =>
          fn.EPDFAction_GetNodeTargetName(modelPtr, nodeId, index, buf, capacity),
        );
        if (name !== null) {
          targets.push({ kind: 'name', name });
          continue;
        }
        const objectNumber = readTargetObjectNumber(nodeId, index);
        if (objectNumber === null) return null; // neither form: unreadable list
        targets.push({ kind: 'objectNumber', objectNumber });
      }
      return targets;
    };

    const readResetFormState = (
      nodeId: number,
    ): { hasFields: boolean; exclude: boolean } | null =>
      withScratchN(mem, [I32_BYTES, I32_BYTES], ([hasFieldsPtr, excludePtr]) => {
        if (!fn.EPDFAction_GetNodeResetForm(modelPtr, nodeId, hasFieldsPtr, excludePtr)) {
          return null;
        }
        return {
          hasFields: readI32(mem, hasFieldsPtr) !== 0,
          exclude: readI32(mem, excludePtr) !== 0,
        };
      });

    const readSubmitFormState = (nodeId: number): { hasFields: boolean; flags: number } | null =>
      withScratchN(mem, [I32_BYTES, I32_BYTES], ([hasFieldsPtr, flagsPtr]) => {
        if (!fn.EPDFAction_GetNodeSubmitForm(modelPtr, nodeId, hasFieldsPtr, flagsPtr)) {
          return null;
        }
        return {
          hasFields: readI32(mem, hasFieldsPtr) !== 0,
          flags: readI32(mem, flagsPtr) >>> 0,
        };
      });

    const readNode = (nodeId: number): PdfActionNode => {
      if (visiting.has(nodeId)) {
        throw malformedActionModel('native action model contains a cycle', { nodeId });
      }
      visiting.add(nodeId);
      try {
        const type = actionTypeFromCode(fn.EPDFAction_GetNodeType(modelPtr, nodeId));
        const subtype =
          readUtf8String(mem, (buf, capacity) =>
            fn.EPDFAction_GetNodeSubtype(modelPtr, nodeId, buf, capacity),
          ) ?? '';

        const nextCount = fn.EPDFAction_GetNextCount(modelPtr, nodeId);
        if (!Number.isInteger(nextCount) || nextCount < 0) {
          throw malformedActionModel('invalid action child count', { nodeId, nextCount });
        }
        const next: PdfActionNode[] = [];
        for (let index = 0; index < nextCount; index++) {
          const childId = normalizeNodeId(
            fn.EPDFAction_GetNextAt(modelPtr, nodeId, index),
            nodeCount,
          );
          next.push(readNode(childId));
        }

        const degraded = (): PdfActionNode => {
          payloadDropped = true;
          return { type: 'unknown', subtype, next };
        };

        switch (type) {
          case 'javascript': {
            if (!fn.EPDFAction_NodeHasJavaScript(modelPtr, nodeId)) return degraded();
            const script =
              readUtf16String(mem, (buf, capacity) =>
                fn.EPDFAction_GetNodeJavaScript(modelPtr, nodeId, buf, capacity),
              ) ?? '';
            budget.addScript(script);
            return { type, subtype, script, next };
          }
          case 'rendition': {
            if (!fn.EPDFAction_NodeHasJavaScript(modelPtr, nodeId)) {
              return { type, subtype, next };
            }
            const script =
              readUtf16String(mem, (buf, capacity) =>
                fn.EPDFAction_GetNodeJavaScript(modelPtr, nodeId, buf, capacity),
              ) ?? '';
            budget.addScript(script);
            return { type, subtype, script, next };
          }
          case 'goto': {
            const destPtr = fn.EPDFAction_GetNodeDest(docPtr, modelPtr, nodeId);
            const destination =
              destPtr !== NULL_PTR ? readDestination(fn, mem, docPtr, destPtr) : null;
            return destination ? { type, subtype, destination, next } : degraded();
          }
          case 'uri': {
            const uri = readPayloadString((buf, capacity) =>
              fn.EPDFAction_GetNodeURI(docPtr, modelPtr, nodeId, buf, capacity),
            );
            if (uri === null) return degraded();
            const isMap =
              readOutBool((outPtr) => fn.EPDFAction_GetNodeURIIsMap(modelPtr, nodeId, outPtr)) ??
              false;
            return { type, subtype, uri, isMap, next };
          }
          case 'named': {
            const name = readPayloadString((buf, capacity) =>
              fn.EPDFAction_GetNodeName(modelPtr, nodeId, buf, capacity),
            );
            return name === null ? degraded() : { type, subtype, name, next };
          }
          case 'hide': {
            const count = fn.EPDFAction_GetNodeTargetCount(modelPtr, nodeId);
            if (!Number.isInteger(count) || count < 0) return degraded();
            budget.reserveTargets(count);
            const targets = readTargets(nodeId, count);
            if (targets === null) return degraded();
            const hide =
              readOutBool((outPtr) => fn.EPDFAction_GetNodeHideFlag(modelPtr, nodeId, outPtr)) ??
              true;
            return { type, subtype, targets, hide, next };
          }
          case 'reset-form': {
            const state = readResetFormState(nodeId);
            const count = fn.EPDFAction_GetNodeTargetCount(modelPtr, nodeId);
            if (state === null || !Number.isInteger(count) || count < 0) return degraded();
            budget.reserveTargets(count);
            const fields = state.hasFields ? readTargets(nodeId, count) : null;
            if (state.hasFields && fields === null) return degraded();
            return { type, subtype, fields, exclude: state.exclude, next };
          }
          case 'submit-form': {
            // Feature-detect: an older runtime payload (pin lag) exposes no
            // submit getters — the node stays payload-less recognized-inert,
            // the pre-payload behavior, NOT a degraded unknown.
            if (typeof fn.EPDFAction_GetNodeSubmitForm !== 'function') {
              return { type, subtype, next };
            }
            const state = readSubmitFormState(nodeId);
            // The getter refuses when the REQUIRED /F did not resolve to a
            // URL: the native side withheld the payload — the atomic rule
            // degrades the whole node, never a half payload.
            if (state === null) return degraded();
            const url = readPayloadString((buf, capacity) =>
              fn.EPDFAction_GetNodeSubmitFormURL(modelPtr, nodeId, buf, capacity),
            );
            if (url === null) return degraded();
            const count = fn.EPDFAction_GetNodeTargetCount(modelPtr, nodeId);
            if (!Number.isInteger(count) || count < 0) return degraded();
            budget.reserveTargets(count);
            const fields = state.hasFields ? readTargets(nodeId, count) : null;
            if (state.hasFields && fields === null) return degraded();
            const charSet = readPayloadString((buf, capacity) =>
              fn.EPDFAction_GetNodeSubmitFormCharSet(modelPtr, nodeId, buf, capacity),
            );
            return {
              type,
              subtype,
              payload: {
                url,
                fields,
                flags: decodeSubmitFormFlags(state.flags),
                ...(charSet === null ? {} : { charSet }),
              },
              next,
            };
          }
          case 'goto-remote':
          case 'goto-embedded':
          case 'launch': {
            const filePath = readPayloadString((buf, capacity) =>
              fn.EPDFAction_GetNodeFilePath(modelPtr, nodeId, buf, capacity),
            );
            return filePath === null ? degraded() : { type, subtype, filePath, next };
          }
          default:
            return { type, subtype, next };
        }
      } finally {
        visiting.delete(nodeId);
      }
    };

    const root = rootId === null ? null : readNode(rootId);
    const warnings = warningsFromFlags(warningFlags, incomplete);
    if (payloadDropped) warnings.push('payload-dropped');
    return { root, incomplete, warningFlags, warnings };
  } finally {
    fn.EPDFAction_CloseModel(modelPtr);
  }
}

function normalizeOptionalNodeId(raw: number, nodeCount: number): number | null {
  const invalid = raw === -1 || raw === INVALID_NODE_U32 || raw >>> 0 === INVALID_NODE_U32;
  return invalid ? null : normalizeNodeId(raw, nodeCount);
}

function normalizeNodeId(raw: number, nodeCount: number): number {
  if (!Number.isInteger(raw) || raw < 0 || raw >= nodeCount) {
    throw malformedActionModel('native action model returned an invalid node id', {
      raw,
      nodeCount,
    });
  }
  return raw;
}

function warningsFromFlags(flags: number, incomplete: boolean): PdfActionWarning[] {
  const warnings: PdfActionWarning[] = [];
  if ((flags & WARNING_CYCLE_DROPPED) !== 0) warnings.push('cycle-dropped');
  if ((flags & WARNING_MALFORMED_NEXT) !== 0) warnings.push('malformed-next');
  if ((flags & WARNING_INCOMPLETE) !== 0 || incomplete) warnings.push('incomplete');
  return warnings;
}

function malformedActionModel(message: string, details: Record<string, unknown>): EngineError {
  return new EngineError(EngineErrorCode.MalformedPdf, message, { details });
}
