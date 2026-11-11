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
  planFormCopies,
  writesScripts,
  type AnnotationRef,
  type ChangeItem,
  type ChangeOp,
  type FormField,
  type FormImportDrop,
  type WidgetAnnotation,
  type WidgetPlacement,
} from '@embedpdf/engine-core/runtime';

import type {
  FormCapability,
  FormDuplicateOptions,
  FormDuplicateResult,
  FormFieldResult,
} from '../contract';
import { fieldByRef, fieldKeyOf, widgetRowOf } from '../model';
import type { FormContext, FormServices } from '../services';
import { createObjectNumbers } from '../services/object-numbers';
import { undoLookOf } from '../sync/predict';
import { widgetDuplicateOf, type DuplicatePlacement } from './duplicate';
import { isMerged, nextChoiceOf } from './new-widget';
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
 * the boxes check together. Other kinds take none.
 */
function exportValueFor(field: FormField): string | undefined {
  if (field.kind === 'checkbox') return field.exportValue;
  if (field.kind !== 'radio') return undefined;
  return nextChoiceOf(field.widgets.map((widget) => widget.exportValue));
}

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

  /** Stage the ops of one design verb as one change, one step of the history. */
  const stageAll = (verb: string, ops: readonly ChangeOp[]): PendingChange =>
    ctx.changes.stage({
      label: { key: `form.${verb}` } satisfies ChangeLabel,
      ops: [...ops],
      undo: undoLookOf(fields.view(), ops),
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

  /** Where a duplicate's copies go, with a page index as that page's ref. */
  const placementOf = (options: FormDuplicateOptions): DuplicatePlacement => ({
    ...(options.page === undefined ? {} : { page: ctx.pageOf(options.page).ref }),
    ...(options.offset ? { offset: options.offset } : {}),
  });

  /**
   * The ops that copy these widgets by the designer's rule (write/duplicate.ts),
   * under the object numbers they take, with each copy's ref and what was
   * left out before the engine is asked.
   */
  const copyOps = async (
    widgets: readonly AnnotationRef[],
    placement: DuplicatePlacement,
    values: boolean,
  ): Promise<{ ops: ChangeOp[]; copies: AnnotationRef[]; dropped: readonly FormImportDrop[] }> => {
    let plan;
    try {
      plan = widgetDuplicateOf(fields.view(), widgets, placement, {
        values,
        mayScript: ctx.allows(SCRIPT),
      });
    } catch (error) {
      throw toPluginError('form', error);
    }
    const taken = plan.needs
      ? (numbers.takeNow(plan.needs) ?? (await numbers.take(plan.needs)))
      : [];
    return { ...plan.build(taken), dropped: plan.dropped };
  };

  const duplicate: FormCapability['duplicate'] = async (refs, options = {}) => {
    allow('form.duplicate');
    if (refs.length === 0) return { fields: [], widgets: [], dropped: [] };
    const placement = placementOf(options);
    const values = options.values ?? false;
    const { snapshot } = fields.view();
    if (!snapshot) throw new PluginError('not-ready', 'form', 'the form is still loading');
    // The engine's own plan says how many objects the copies are.
    let count: number;
    try {
      const plan = planFormCopies({
        form: snapshot,
        fields: refs,
        placement,
        values,
        mayScript: true,
      });
      count = plan.creates.reduce((sum, create) => sum + 1 + create.widgets.length, 0);
    } catch (error) {
      throw toPluginError('form', error);
    }
    const objectNumbers = count ? (numbers.takeNow(count) ?? (await numbers.take(count))) : [];
    const change = stageAll('duplicate', [
      { type: 'forms.copy', fields: refs, ...placement, values, objectNumbers },
    ]);
    const item = await answer<'forms.copy'>(change, options);
    return { fields: item.fields, widgets: item.widgets, dropped: item.dropped };
  };

  const duplicateWidgets: FormCapability['duplicateWidgets'] = async (refs, options = {}) => {
    allow('form.duplicate');
    const copy = await copyOps(refs, placementOf(options), options.values ?? false);
    if (copy.ops.length === 0) return { fields: [], widgets: [], dropped: [...copy.dropped] };
    const change = stageAll('duplicate', copy.ops);
    let items: readonly ChangeItem[];
    try {
      items = (await ctx.cancellable(options.signal, change.result)).items;
    } catch (error) {
      throw toPluginError('form', error);
    }
    return duplicateResultOf(items, copy.copies, copy.dropped);
  };

  return {
    copyOps,
    api: {
      create,
      addWidget,
      duplicate,
      duplicateWidgets,
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

/**
 * What a duplicate of widgets resolves, read off the engine's answer: the
 * fields it made and each field that got a new button, as they are after the
 * last op that named them; the copies' rows, in the order their originals
 * were given; and what was left out, here and by the engine.
 */
function duplicateResultOf(
  items: readonly ChangeItem[],
  copies: readonly AnnotationRef[],
  dropped: readonly FormImportDrop[],
): FormDuplicateResult {
  const fields = new Map<string, FormField>();
  const rows = new Map<number, WidgetAnnotation>();
  const left: FormImportDrop[] = [...dropped];
  const hold = (row: WidgetAnnotation): void => {
    if (row.ref.kind === 'objectNumber') rows.set(row.ref.objectNumber, row);
  };
  for (const item of items) {
    if (item.type === 'forms.copy') {
      for (const field of item.fields) fields.set(fieldKeyOf(field), field);
      item.widgets.forEach(hold);
      left.push(...item.dropped);
    } else if (item.type === 'forms.addWidget') {
      fields.set(fieldKeyOf(item.field), item.field);
      item.widgets.forEach(hold);
    } else if (item.type === 'forms.updateWidget') {
      hold(item.widget);
    }
  }
  return {
    fields: [...fields.values()],
    widgets: copies.flatMap((copy) =>
      copy.kind === 'objectNumber' ? (rows.get(copy.objectNumber) ?? []) : [],
    ),
    dropped: left,
  };
}
