import type {
  ActionReadBudget,
  PdfActionNode,
  PdfActionTree,
  PdfActionType,
  PdfActionWarning,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import {
  NULL_PTR,
  type PdfFunctions,
  type PdfRuntimeMemory,
  type Ptr,
} from '@embedpdf/pdf-runtime';

import { readUtf16String, readUtf8String } from '../../runtime/memory/strings';

const DEFAULT_ACTION_READ_BUDGET: ActionReadBudget = {
  maxModels: 512,
  maxNodes: 16_384,
  maxScriptCodeUnits: 16_000_000,
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
 *  (the link-target projection) use so the two surfaces cannot drift. */
export function actionTypeFromCode(code: number): PdfActionType {
  return ACTION_TYPE_BY_CODE[code] ?? 'unknown';
}

/** Is this `EPDFAction_GetRootNode`/`GetNextAt` result a real node id?
 *  (`EPDF_ACTION_NODE_INVALID` may surface as -1 or u32 max via cwrap.) */
export function isValidActionNodeId(raw: number): boolean {
  return raw !== -1 && raw >>> 0 !== INVALID_NODE_U32;
}

/** Mutable aggregate budget shared by every action model in one read job. */
export class ActionReadBudgetTracker {
  private models = 0;
  private nodes = 0;
  private scriptCodeUnits = 0;

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

  private assertWithinBudget(): void {
    if (
      this.models > this.limits.maxModels ||
      this.nodes > this.limits.maxNodes ||
      this.scriptCodeUnits > this.limits.maxScriptCodeUnits
    ) {
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        'aggregate PDF action read budget exceeded',
        {
          details: {
            models: this.models,
            nodes: this.nodes,
            scriptCodeUnits: this.scriptCodeUnits,
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
 */
export function readActionModel(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
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

    const readNode = (nodeId: number): PdfActionNode => {
      if (visiting.has(nodeId)) {
        throw malformedActionModel('native action model contains a cycle', { nodeId });
      }
      visiting.add(nodeId);
      try {
        const subtype =
          readUtf8String(mem, (buf, capacity) =>
            fn.EPDFAction_GetNodeSubtype(modelPtr, nodeId, buf, capacity),
          ) ?? '';
        const script = fn.EPDFAction_NodeHasJavaScript(modelPtr, nodeId)
          ? (readUtf16String(mem, (buf, capacity) =>
              fn.EPDFAction_GetNodeJavaScript(modelPtr, nodeId, buf, capacity),
            ) ?? '')
          : undefined;
        if (script !== undefined) budget.addScript(script);

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
        return {
          type: ACTION_TYPE_BY_CODE[fn.EPDFAction_GetNodeType(modelPtr, nodeId)] ?? 'unknown',
          subtype,
          ...(script !== undefined ? { script } : {}),
          next,
        };
      } finally {
        visiting.delete(nodeId);
      }
    };

    return {
      root: rootId === null ? null : readNode(rootId),
      incomplete,
      warningFlags,
      warnings: warningsFromFlags(warningFlags, incomplete),
    };
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
