/**
 * Building the form: every design verb is one change on the document's queue
 * (`ctx.changes`). It shows at once (the fields mirror predicts it), it is a
 * step of the history, and it resolves with the engine's answer. A create
 * takes its field's and widgets' object numbers first, so their refs are final
 * from the first frame and the new widget can be selected straight away.
 */
import {
  toPluginError,
  type ChangeLabel,
  type OperationOptions,
  type PendingChange,
} from '@embedpdf/core';
import {
  draftWritesScripts,
  writesScripts,
  type ChangeItem,
  type ChangeOp,
} from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFieldResult } from '../contract';
import type { FormContext, FormServices } from '../services';
import { createObjectNumbers } from '../services/object-numbers';
import { undoLookOf } from '../sync/predict';

const MODIFY = 'doc.forms.modify';
const SCRIPT = 'doc.forms.script';

/** The answer's item for the change's only op, of the type it names. */
type ItemOf<T extends ChangeItem['type']> = Extract<ChangeItem, { type: T }>;

export function createFieldWrites(
  ctx: FormContext,
  { fields, enqueue }: Pick<FormServices, 'fields' | 'enqueue'>,
) {
  const numbers = createObjectNumbers(ctx);

  /** Refuse up front without `doc.forms.modify`, and without `doc.forms.script` when it writes scripts. */
  const allow = (operation: string, scripts = false): void => {
    ctx.assertAllowed(MODIFY, operation);
    if (scripts) ctx.assertAllowed(SCRIPT, operation);
  };

  /** Stage one design op as its own change: it shows at once, and undoing it shows the form as it was. */
  const stage = (verb: string, op: ChangeOp): PendingChange =>
    ctx.changes.stage({
      label: { key: `form.${verb}` } satisfies ChangeLabel,
      ops: [op],
      undo: undoLookOf(fields.view(), [op]),
    });

  /** The engine's answer to a staged design change: its one item. */
  const answer = async <T extends ChangeItem['type']>(
    change: PendingChange,
    options?: OperationOptions,
  ): Promise<ItemOf<T>> => {
    try {
      const result = await ctx.cancellable(options?.signal, change.result);
      return result.items[0] as ItemOf<T>;
    } catch (error) {
      throw toPluginError('form', error);
    }
  };

  const create: FormCapability['create'] = async (draft, options) => {
    allow('form.create', draftWritesScripts(draft));
    // The field, then each widget, in the draft's order.
    const count = 1 + (draft.widgets?.length ?? 0);
    const [objectNumber, ...widgetObjectNumbers] =
      numbers.takeNow(count) ?? (await numbers.take(count));
    const change = stage('create', {
      type: 'forms.create',
      draft,
      objectNumber,
      widgetObjectNumbers,
    });
    const item = await answer<'forms.create'>(change, options);
    return { field: item.field } satisfies FormFieldResult;
  };

  return {
    api: {
      create,
      update: async (ref, patch, options) => {
        allow('form.update', writesScripts(patch.actions));
        const change = stage('update', { type: 'forms.update', field: ref, patch });
        return { field: (await answer<'forms.update'>(change, options)).field };
      },
      reorderCalculations: async (fields, position, options) => {
        allow('form.reorderCalculations');
        const change = stage('reorderCalculations', {
          type: 'forms.reorderCalculations',
          fields,
          position,
        });
        const item = await answer<'forms.reorderCalculations'>(change, options);
        return { calculationOrder: item.calculationOrder };
      },
      delete: async (ref, options) => {
        allow('form.delete');
        await answer(stage('delete', { type: 'forms.delete', field: ref }), options);
      },
      removeWidget: async (ref, widget, options) => {
        allow('form.removeWidget');
        const change = stage('removeWidget', { type: 'forms.removeWidget', field: ref, widget });
        return { field: (await answer<'forms.removeWidget'>(change, options)).field };
      },
      updateWidget: async (widget, patch, options) => {
        allow('form.updateWidget');
        const change = stage('updateWidget', { type: 'forms.updateWidget', widget, patch });
        return { widget: (await answer<'forms.updateWidget'>(change, options)).widget };
      },
      deleteWidget: async (widget, options) => {
        allow('form.deleteWidget');
        const change = stage('deleteWidget', { type: 'forms.deleteWidget', widget });
        return { field: (await answer<'forms.deleteWidget'>(change, options)).field };
      },
      // A repair reads the whole form and fixes it where it stands: not a change of ops.
      repair: async (options) => {
        allow('form.repair');
        const { signal, ...repair } = options ?? {};
        const run = () => (options ? ctx.doc.forms.repair(repair) : ctx.doc.forms.repair());
        return enqueue(() => ctx.cancellable(signal, run()), options);
      },
    } satisfies Partial<FormCapability>,
  };
}
