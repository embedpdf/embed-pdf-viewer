import { EngineError, EngineErrorCode, isFieldScript } from '@embedpdf/engine-core/runtime';
import type {
  FieldActionsPatch,
  FieldScriptEvent,
  FieldScriptWrite,
  PdfActionTree,
  PdfDestination,
  PdfFieldActions,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { writeActionTree } from '../../actions/internal/writeActionTree';

// Mirrors EPDF_FORM_ACTION_* in public/epdf_form.h.
const EVENT_CODE: Record<FieldScriptEvent, number> = {
  keystroke: 0,
  format: 1,
  validate: 2,
  calculate: 3,
};

/**
 * Write a field's scripts as `patch` says: a script sets its event's, `null`
 * removes it, an event left out keeps what it has. An event whose script is
 * already the one written is left alone, so a write that changes nothing
 * copies nothing up for writing. A field event takes JavaScript only.
 */
export function writeFieldScripts(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
  current: PdfFieldActions<PdfDestination> | undefined,
  patch: FieldActionsPatch,
): void {
  for (const event of Object.keys(EVENT_CODE) as FieldScriptEvent[]) {
    const script = patch[event];
    if (script === undefined) continue;
    if (script !== null && !isFieldScript(script)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `a field's ${event} event takes JavaScript only`,
        { details: { field: `actions.${event}` } },
      );
    }
    const now = current?.[event];
    if (script === null ? !now : now !== undefined && holds(now, script)) continue;
    const action = script === null ? NULL_PTR : writeActionTree(runtime, docPtr, script);
    if (!runtime.fn.EPDFForm_SetFieldEventAction(docPtr, fieldObjectNumber, EVENT_CODE[event], action)) {
      throw new EngineError(EngineErrorCode.Unknown, `the field's ${event} script could not be written`);
    }
  }
}

/** Whether a read tree is exactly `script`: the same scripts, chained the same way. */
function holds(tree: PdfActionTree<PdfDestination>, script: FieldScriptWrite): boolean {
  if (tree.incomplete || !tree.root) return false;
  const same = (node: PdfActionTree<PdfDestination>['root'], write: FieldScriptWrite): boolean => {
    if (!node || node.type !== 'javascript' || node.script !== write.script) return false;
    const next = write.next ?? [];
    return node.next.length === next.length && node.next.every((child, at) => same(child, next[at]!));
  };
  return same(tree.root, script);
}
