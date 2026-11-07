import {
  EngineError,
  colorOf,
  toOutlineItemRef,
  type ActionReadBudget,
  type OutlineItem,
  type PdfActionTree,
  type PdfDestination,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { TOP } from './readOutlineTree';
import { withScratchN } from '../../../runtime/memory/scratch';
import { readUtf16String } from '../../../runtime/memory/strings';
import { F32_BYTES, readF32 } from '../../../runtime/memory/structs';
import { ActionReadBudgetTracker, readActionModel } from '../../actions/ActionModelReader';
import { linkTargetFromActionTree } from '../../destinations/linkTarget';
import { readDestination } from '../../destinations/readDestination';

/**
 * What one read of an outline may spend on its items' actions: one action
 * model per item at most, and room for a URI or a script on each. Past it,
 * an item's action reads as missing and the outline as incomplete.
 */
export const OUTLINE_ACTION_READ_BUDGET: ActionReadBudget = {
  maxModels: 50_000,
  maxNodes: 200_000,
  maxScriptCodeUnits: 16_000_000,
  maxTargetEntries: 65_536,
  maxPayloadCodeUnits: 16_000_000,
};

/** `/F` bit 1. */
const ITALIC = 1;
/** `/F` bit 2. */
const BOLD = 2;

/** An item as read, and whether all of it could be read: its action may not. */
export interface ReadOutlineItem {
  readonly item: OutlineItem<PdfDestination>;
  readonly complete: boolean;
}

/** A budget for one read of the outline's actions. */
export function outlineActionBudget(): ActionReadBudgetTracker {
  return new ActionReadBudgetTracker(OUTLINE_ACTION_READ_BUDGET);
}

/**
 * The item `handle` reads, at `objectNumber` under `parent` ({@link TOP} for
 * the top level). Its target is read the way a link's is: the `/A` tree's
 * navigation view, else the `/Dest`; an action that can't be read makes the
 * target `unsupported`.
 */
export function readOutlineItem(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  handle: Ptr,
  objectNumber: number,
  parent: number,
  budget: ActionReadBudgetTracker,
): ReadOutlineItem {
  const { fn, mem } = runtime;
  const title =
    readUtf16String(mem, (buf, capacity) => fn.FPDFBookmark_GetTitle(handle, buf, capacity)) ?? '';
  const hasChildren = fn.FPDFBookmark_GetFirstChild(docPtr, handle) !== NULL_PTR;
  const style = fn.FPDFBookmark_GetStyle(handle);
  const { action, target, complete } = readTarget(runtime, docPtr, handle, budget);
  return {
    item: {
      ref: toOutlineItemRef(objectNumber),
      parent: parent === TOP ? null : toOutlineItemRef(parent),
      title,
      target,
      action,
      open: hasChildren && fn.FPDFBookmark_GetCount(handle) > 0,
      color: readColor(runtime, handle),
      bold: (style & BOLD) !== 0,
      italic: (style & ITALIC) !== 0,
    },
    complete,
  };
}

function readTarget(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  handle: Ptr,
  budget: ActionReadBudgetTracker,
): {
  action: PdfActionTree<PdfDestination> | null;
  target: PdfLinkTarget<PdfDestination> | null;
  complete: boolean;
} {
  const { fn, mem } = runtime;
  const actionPtr = fn.FPDFBookmark_GetAction(handle);
  if (actionPtr) {
    try {
      const action = readActionModel(fn, mem, docPtr, fn.EPDFAction_LoadModel(actionPtr), budget);
      return {
        action,
        target: action ? linkTargetFromActionTree(action) : { kind: 'unsupported' },
        complete: action !== null && !action.incomplete,
      };
    } catch (error) {
      // A broken action, or the read's budget spent: this target is dead.
      if (!EngineError.is(error)) throw error;
      return { action: null, target: { kind: 'unsupported' }, complete: false };
    }
  }
  // No /A: the /Dest, a named one resolved; a page that is gone reads as none.
  const destPtr = fn.FPDFBookmark_GetDest(docPtr, handle);
  if (!destPtr) return { action: null, target: null, complete: true };
  const destination = readDestination(fn, mem, docPtr, destPtr);
  return {
    action: null,
    target: destination ? { kind: 'goto', destination } : { kind: 'unsupported' },
    complete: true,
  };
}

/** `/C` as `#rrggbb`, or `null` when the item has none. */
function readColor(runtime: PdfRuntimeModule, handle: Ptr): string | null {
  const { fn, mem } = runtime;
  return withScratchN(mem, [F32_BYTES, F32_BYTES, F32_BYTES], ([r, g, b]) => {
    if (!fn.FPDFBookmark_GetColor(handle, r!, g!, b!)) return null;
    const channel = (ptr: Ptr) => Math.min(255, Math.max(0, Math.round(readF32(mem, ptr) * 255)));
    return colorOf(channel(r!), channel(g!), channel(b!));
  });
}
