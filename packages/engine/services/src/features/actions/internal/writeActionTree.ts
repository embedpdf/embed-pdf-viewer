import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type {
  PdfActionTargetRef,
  PdfActionWrite,
  PdfDestination,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { pointerBytes, pokePointer, withPointerTable } from '../../../runtime/memory/pointers';
import { withScratch } from '../../../runtime/memory/scratch';
import { withUtf16String } from '../../../runtime/memory/strings';
import { createDestination } from '../../destinations/createDestination';

// Mirrors EPDF_ACTION_TARGET_* in public/epdf_action.h.
const TARGET_NAME = 0;
const TARGET_OBJECT = 1;

/**
 * Write `action` as new indirect action dictionaries of the document,
 * bottom-up: each node's `next` first, then the node, chained to them in
 * order. Returns the root's handle, to set on an event
 * (`EPDFForm_SetFieldEventAction`, `EPDFAnnot_SetEventAction`). Which
 * actions an event may hold, and who may write them, is the caller's to
 * check first.
 */
export function writeActionTree(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  action: PdfActionWrite<PdfDestination>,
): Ptr {
  const next = (action.next ?? []).map((child) => writeActionTree(runtime, docPtr, child));
  const node = createAction(runtime, docPtr, action);
  if (next.length > 0) {
    const chained = withPointerTable(runtime, next, (table, count) =>
      runtime.fn.EPDFAction_SetNext(docPtr, node, table, count),
    );
    if (!chained) {
      throw new EngineError(EngineErrorCode.Unknown, `the ${action.type} action's next ones could not be set`);
    }
  }
  return node;
}

/** One action dictionary, without its `next`. */
function createAction(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  action: PdfActionWrite<PdfDestination>,
): Ptr {
  const { fn, mem } = runtime;
  const made = ((): Ptr => {
    switch (action.type) {
      case 'javascript':
        return withUtf16String(mem, action.script, (script) =>
          fn.EPDFAction_CreateJavaScript(docPtr, script),
        );
      case 'goto':
        return fn.EPDFAction_CreateGoTo(
          docPtr,
          createDestination(fn, mem, docPtr, action.destination),
        );
      case 'uri':
        return fn.EPDFAction_CreateURI(docPtr, action.uri);
      case 'named':
        return fn.EPDFAction_CreateNamed(docPtr, action.name);
      case 'hide':
        return withTargets(runtime, action.targets, (targets, count) =>
          fn.EPDFAction_CreateHide(docPtr, targets, count, action.hide),
        );
      case 'reset-form':
        return withTargets(runtime, action.fields ?? [], (targets, count) =>
          fn.EPDFAction_CreateResetForm(
            docPtr,
            targets,
            action.fields ? count : -1, // -1: no /Fields, every field
            action.exclude,
          ),
        );
      case 'submit-form':
        return withUtf16String(mem, action.url, (url) =>
          withTargets(runtime, action.fields ?? [], (targets, count) =>
            fn.EPDFAction_CreateSubmitForm(
              docPtr,
              url,
              targets,
              action.fields ? count : -1, // -1: no /Fields, every field
              action.flags ?? 0,
            ),
          ),
        );
    }
  })();
  if (!made) {
    throw new EngineError(EngineErrorCode.InvalidArg, `the ${action.type} action could not be written`);
  }
  return made;
}

/**
 * An `EPDF_ACTION_TARGET` table of `targets`, for the duration of `body`:
 * `{ int kind; uint32_t object_number; FPDF_WIDESTRING name; }`, the name
 * at offset 8 and the struct as wide as the runtime's pointers make it.
 */
function withTargets<T>(
  runtime: PdfRuntimeModule,
  targets: readonly PdfActionTargetRef[],
  body: (table: Ptr, count: number) => T,
): T {
  const { mem } = runtime;
  const stride = 8 + pointerBytes(runtime);
  const names = targets.map((target) =>
    target.kind === 'name' ? mem.writeU16String(target.name) : null,
  );
  try {
    return withScratch(mem, Math.max(1, targets.length * stride), (table) => {
      targets.forEach((target, at) => {
        const base = at * stride;
        const name = names[at];
        mem.poke(table, 'i32', name ? TARGET_NAME : TARGET_OBJECT, base);
        mem.poke(table, 'i32', target.kind === 'objectNumber' ? target.objectNumber : 0, base + 4);
        pokePointer(runtime, table, base + 8, name ?? NULL_PTR);
      });
      return body(table, targets.length);
    });
  } finally {
    for (const name of names) if (name) mem.free(name);
  }
}
