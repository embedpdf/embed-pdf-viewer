import type { DocumentFormsService } from './DocumentFormsService';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { Change, ChangeItem, ChangeOp, ChangeResult } from '../mutation/Change';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

/** The verbs of `doc.forms` that are each one op of a change. */
export type FormChangeVerb = 'copy' | 'setButtonImage';

/**
 * `doc.forms` on any engine: what `rest` holds (every read and write the
 * engine has a job of its own for), and `copy` and `setButtonImage` as one-op
 * changes through `apply`, so each has its op's checks, events and undo
 * (its `opId` undoes it).
 */
export function formVerbs(
  rest: Omit<DocumentFormsService, FormChangeVerb>,
  apply: (change: Change, options?: WriteOptions) => AbortablePromise<ChangeResult>,
): DocumentFormsService {
  return {
    list: () => rest.list(),
    get: (ref) => rest.get(ref),
    setValue: (ref, value, options) => rest.setValue(ref, value, options),
    reset: (fields, options) => rest.reset(fields, options),
    export: (selection) => rest.export(selection),
    import: (bundle, options) => rest.import(bundle, options),
    importValues: (bundle, options) => rest.importValues(bundle, options),
    create: (draft, options) => rest.create(draft, options),
    update: (ref, patch, options) => rest.update(ref, patch, options),
    setSignatureAppearance: (ref, appearance, options) =>
      rest.setSignatureAppearance(ref, appearance, options),
    delete: (ref, options) => rest.delete(ref, options),
    addWidget: (ref, placement, options) => rest.addWidget(ref, placement, options),
    removeWidget: (ref, widget, options) => rest.removeWidget(ref, widget, options),
    deleteWidget: (widget, options) => rest.deleteWidget(widget, options),
    updateWidget: (widget, patch, options) => rest.updateWidget(widget, patch, options),
    reorderWidgets: (widgets, position, options) => rest.reorderWidgets(widgets, position, options),
    reorderCalculations: (fields, position, options) =>
      rest.reorderCalculations(fields, position, options),
    repair: (options) => rest.repair(options),
    copy: (fields, options = {}) =>
      AbortablePromise.run(async (signal) => {
        const { opId, widgets, page, offset, values, objectNumbers } = options;
        const item = await applyOne(
          apply,
          {
            type: 'forms.copy',
            fields,
            ...(widgets === undefined ? {} : { widgets }),
            ...(page === undefined ? {} : { page }),
            ...(offset === undefined ? {} : { offset }),
            ...(values === undefined ? {} : { values }),
            ...(objectNumbers === undefined ? {} : { objectNumbers }),
          },
          opId,
        ).abortWith(signal);
        if (item.type !== 'forms.copy') throw wroteNothing(item.type);
        const { type: _type, ...copied } = item;
        return copied;
      }),
    setButtonImage: (ref, image, options = {}) =>
      AbortablePromise.run(async (signal) => {
        const item = await applyOne(
          apply,
          { type: 'forms.setButtonImage', field: ref, image },
          options.opId,
        ).abortWith(signal);
        if (item.type !== 'forms.setButtonImage') throw wroteNothing(item.type);
        const { type: _type, ...updated } = item;
        return updated;
      }),
  };
}

/** Apply `op` as a change of its own, and resolve its one item. */
function applyOne(
  apply: (change: Change, options?: WriteOptions) => AbortablePromise<ChangeResult>,
  op: ChangeOp,
  opId: string | undefined,
): AbortablePromise<ChangeItem> {
  return AbortablePromise.run(async (signal) => {
    const result = await apply({ ops: [op] }, opId === undefined ? {} : { opId }).abortWith(signal);
    const item = result.items[0];
    // A fresh op is never skipped: only an undo leaves one alone.
    if (!item) throw wroteNothing(op.type);
    return item;
  });
}

function wroteNothing(type: string): EngineError {
  return new EngineError(EngineErrorCode.Unknown, `${type} wrote nothing`);
}
