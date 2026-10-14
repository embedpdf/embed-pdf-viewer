import { EngineError, EngineErrorCode, WIDGET_ACTION_EVENTS } from '@embedpdf/engine-core/runtime';
import type { PdfDestination, WidgetActionsPatch } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import { writeActionTree } from './writeActionTree';

/**
 * Set a widget's actions as `patch` says: an action sets its event's (`/A`
 * for `activate`, the `/AA` entry for the others), `null` removes it, and an
 * event left out keeps what it has. A `null` patch removes every event. On a
 * field merged with its widget, the field's own events are left alone (the
 * runtime writes only the widget's keys).
 */
export function writeWidgetActions(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  annotPtr: Ptr,
  patch: WidgetActionsPatch<PdfDestination> | null,
): void {
  // An event's code is its place in WIDGET_ACTION_EVENTS (EPDF_ANNOT_ACTION_*).
  WIDGET_ACTION_EVENTS.forEach((event, code) => {
    const action = patch === null ? null : patch[event];
    if (action === undefined) return;
    const handle = action === null ? NULL_PTR : writeActionTree(runtime, docPtr, action);
    if (!runtime.fn.EPDFAnnot_SetEventAction(annotPtr, code, handle)) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `the widget's ${event} action could not be written`,
      );
    }
  });
}
