/**
 * Building the form: every design verb is one change on the document's queue
 * (`ctx.changes`). It shows at once (the fields mirror predicts it), it is a
 * step of the history, and it resolves with the engine's answer. A create
 * takes its field's and widgets' object numbers first, so their refs are final
 * from the first frame and the new widget can be selected straight away.
 */
import {
  PluginError,
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
  type FormFieldDTO,
  type WidgetAnnotation,
  type WidgetPlacement,
} from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFieldResult } from '../contract';
import { fieldByRef, widgetRowOf } from '../model';
import type { FormContext, FormServices } from '../services';
import { createObjectNumbers } from '../services/object-numbers';
import { undoLookOf } from '../sync/predict';
import { nextInLine } from './next-in-line';

/**
 * A widget's look, as `addWidget()` copies it from the field's last widget onto the new one:
 * the engine's widget style fields (`WIDGET_STYLE_NAMES`), and its turn.
 */
const LOOK = [
  'color',
  'interiorColor',
  'strokeWidth',
  'borderStyle',
  'dashArray',
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
  'caption',
  'checkStyle',
  'rotation',
] as const;

const lookOf = (widget: WidgetAnnotation | undefined): Partial<WidgetPlacement> => {
  if (!widget) return {};
  const held = widget as unknown as Record<string, unknown>;
  const look: Record<string, unknown> = {};
  for (const name of LOOK)
    if (held[name] !== undefined && held[name] !== null) look[name] = held[name];
  return look as Partial<WidgetPlacement>;
};

/**
 * The export value a field's new widget gets when none is given: a radio group's next free
 * `Choice<n>` (the radio tool names its first button `Choice1`), a checkbox's own value, so
 * the boxes check together. Other families take none.
 */
function exportValueFor(field: FormFieldDTO): string | undefined {
  if (field.family === 'checkbox') return field.exportValue;
  if (field.family !== 'radio') return undefined;
  const taken = new Set(field.widgets.map((widget) => widget.exportValue));
  let n = field.widgets.length + 1;
  while (taken.has(`Choice${n}`)) n += 1;
  return `Choice${n}`;
}

/** Whether the field's dictionary is its only widget's too, which adding a widget splits. */
const isMerged = (field: FormFieldDTO): boolean =>
  field.ref.kind === 'objectNumber' &&
  field.widgets.some(
    (widget) => widget.objectNumber === (field.ref as { objectNumber: number }).objectNumber,
  );

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

  const addWidget: FormCapability['addWidget'] = async (ref, placement = {}, options) => {
    allow('form.addWidget', writesScripts(placement.actions));
    const index = fields.view();
    const field = fieldByRef(index, ref);
    if (!field) throw new PluginError('not-found', 'form', 'no form field has this ref');
    const rows = field.widgets
      .map((widget) => widgetRowOf(index, widget.objectNumber))
      .filter((row): row is WidgetAnnotation => row !== null);
    const last = rows.at(-1);
    const page = placement.page ?? last?.page;
    if (!page) {
      throw new PluginError(
        'invalid-input',
        'form',
        'the field shows on no page: give `page` and `rect`',
      );
    }
    const size = ctx.getPage(page)?.size;
    const onPage = rows.filter((row) => row.page.objectNumber === page.objectNumber);
    const rect =
      placement.rect ??
      placement.box ??
      (size && onPage.length > 0
        ? nextInLine(
            onPage.map((row) => row.box),
            size,
          )
        : undefined);
    if (!rect) {
      throw new PluginError(
        'invalid-input',
        'form',
        'no widget of the field on that page: give `rect`',
      );
    }
    const exportValue = placement.exportValue ?? exportValueFor(field);
    const split = isMerged(field);
    const [objectNumber, splitObjectNumber] =
      numbers.takeNow(split ? 2 : 1) ?? (await numbers.take(split ? 2 : 1));
    const change = stage('addWidget', {
      type: 'forms.addWidget',
      field: field.ref,
      placement: {
        ...lookOf(last),
        ...placement,
        page,
        ...(placement.box ? {} : { rect }),
        ...(exportValue === undefined ? {} : { exportValue }),
      },
      objectNumber,
      ...(split ? { splitObjectNumber } : {}),
    });
    const item = await answer<'forms.addWidget'>(change, options);
    const widget =
      item.widgets.find(
        (row) => row.ref.kind === 'objectNumber' && row.ref.objectNumber === objectNumber,
      ) ?? item.widgets.at(-1)!;
    return { field: item.field, widget };
  };

  return {
    api: {
      create,
      addWidget,
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
