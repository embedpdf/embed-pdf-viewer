/**
 * Duplicate, for a form's widgets. What a copy becomes follows from what its
 * widget is. A radio button is one answer of its group, so its copy is
 * another button of that group (`forms.addWidget`), with the next free value.
 * Any other widget is a whole question, so its copy is a new field
 * (`forms.copy`), and widgets of one field copied together become one new
 * field. Pure: the ops, given the object numbers they take.
 */
import { PluginError } from '@embedpdf/core';
import {
  annotationKey,
  planFormCopies,
  widgetFlagsOf,
  widgetPlacementOf,
  type AnnotationRef,
  type ChangeOp,
  type FormCopyPlan,
  type FormField,
  type FormImportDrop,
  type PageRef,
  type WidgetAnnotation,
  type WidgetFlags,
  type WidgetPlacement,
} from '@embedpdf/engine-core/runtime';

import { isMerged, nextChoiceOf } from './new-widget';
import { fieldForWidget, fieldKeyOf, widgetRowOf, type FieldIndex } from '../model';

/** Where copies go: each on its own page or on `page`, moved by `offset` in page points. */
export interface DuplicatePlacement {
  readonly page?: PageRef;
  readonly offset?: { readonly x: number; readonly y: number };
}

/** The ops that copy some widgets, before they have their object numbers. */
export interface WidgetDuplicate {
  /** How many object numbers the ops take. */
  readonly needs: number;
  /** What is left out before the engine is asked: a widget in no field, an action the session may not write. */
  readonly dropped: readonly FormImportDrop[];
  /**
   * The ops under these numbers, and the copy of each widget that is copied,
   * in the order the widgets were given.
   */
  build(numbers: readonly number[]): { ops: ChangeOp[]; copies: AnnotationRef[] };
}

/** The flags a widget has when a create or `addWidget` made it. */
const NEW_WIDGET_FLAGS: WidgetFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};

/** The flags of `row` a new widget doesn't have, as a widget patch. */
function flagsToSet(row: WidgetAnnotation): Partial<WidgetFlags> {
  const flags = widgetFlagsOf(row) as Record<string, unknown>;
  const fresh = NEW_WIDGET_FLAGS as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(flags).filter(([name, value]) => value !== fresh[name]),
  ) as Partial<WidgetFlags>;
}

const numberOf = (ref: AnnotationRef): number =>
  ref.kind === 'objectNumber' ? ref.objectNumber : -1;

/**
 * The ops that copy `widgets`, which the form shows, by the rule above.
 * `mayScript` is whether the session may write scripts, submits and links: a
 * copied radio button is a write of this plugin's, so it leaves them out
 * itself; a copied field is the engine's write, which leaves them out there.
 * Throws `not-found` for a widget the form doesn't show.
 */
export function widgetDuplicateOf(
  index: FieldIndex,
  widgets: readonly AnnotationRef[],
  placement: DuplicatePlacement,
  options: { readonly values: boolean; readonly mayScript: boolean },
): WidgetDuplicate {
  const { snapshot } = index;
  const offset = placement.offset ?? { x: 0, y: 0 };
  const dropped: FormImportDrop[] = [];
  const rows = widgets.map((ref) => {
    const row = widgetRowOf(index, numberOf(ref));
    if (!row || !snapshot) {
      throw new PluginError('not-found', 'form', `no widget ${annotationKey(ref)}`);
    }
    return row;
  });

  /** The fields copied whole or in part, in the order their first widget was given. */
  const fields: FormField[] = [];
  const only: AnnotationRef[] = [];
  /** Each radio button copied, with the new button's place, look and value. */
  const buttons: {
    readonly row: WidgetAnnotation;
    readonly field: FormField;
    readonly placement: WidgetPlacement;
    readonly split: boolean;
  }[] = [];
  const values = new Map<string, string[]>();
  const split = new Set<string>();
  for (const row of rows) {
    const field = fieldForWidget(index, numberOf(row.ref));
    if (!field) {
      dropped.push({ ref: null, widget: row.ref, reason: 'no-field' });
      continue;
    }
    const key = fieldKeyOf(field);
    if (field.kind !== 'radio') {
      if (!fields.some((known) => fieldKeyOf(known) === key)) fields.push(field);
      only.push(row.ref);
      continue;
    }
    const taken = values.get(key) ?? field.widgets.map((widget) => widget.exportValue);
    const exportValue = nextChoiceOf(taken);
    values.set(key, [...taken, exportValue]);
    const look = widgetPlacementOf(field, row, (same) => same, options.mayScript, dropped);
    buttons.push({
      row,
      field,
      placement: {
        ...look,
        ...(placement.page ? { page: placement.page } : {}),
        ...(look.rect
          ? { rect: { ...look.rect, x: look.rect.x + offset.x, y: look.rect.y + offset.y } }
          : {}),
        exportValue,
      },
      // Only the first button added splits a merged group.
      split: isMerged(field) && !split.has(key),
    });
    split.add(key);
  }

  let plan: FormCopyPlan | null = null;
  if (fields.length > 0 && snapshot) {
    plan = planFormCopies({
      form: snapshot,
      fields: fields.map((field) => field.ref),
      widgets: only,
      placement,
      values: options.values,
      // The engine decides what the session may write, and says what it left out.
      mayScript: true,
    });
  }
  const forFields = plan
    ? plan.creates.reduce((count, create) => count + 1 + create.widgets.length, 0)
    : 0;
  const needs = forFields + buttons.reduce((count, button) => count + (button.split ? 2 : 1), 0);

  return {
    needs,
    dropped,
    build(numbers) {
      const ops: ChangeOp[] = [];
      const copyOf = new Map<string, AnnotationRef>();
      let at = 0;
      if (plan) {
        ops.push({
          type: 'forms.copy',
          fields: fields.map((field) => field.ref),
          widgets: only,
          ...(placement.page ? { page: placement.page } : {}),
          ...(placement.offset ? { offset: placement.offset } : {}),
          values: options.values,
          objectNumbers: numbers.slice(0, forFields),
        });
        for (const create of plan.creates) {
          // Its own number, then its widgets', in the order they are copied.
          at += 1;
          create.widgets.forEach((source, widget) => {
            copyOf.set(annotationKey(source), {
              kind: 'objectNumber',
              page: create.draft.widgets![widget]!.page,
              objectNumber: numbers[at + widget]!,
            });
          });
          at += create.widgets.length;
        }
      }
      for (const button of buttons) {
        const objectNumber = numbers[at]!;
        const copy: AnnotationRef = {
          kind: 'objectNumber',
          page: button.placement.page,
          objectNumber,
        };
        ops.push({
          type: 'forms.addWidget',
          field: button.field.ref,
          placement: button.placement,
          objectNumber,
          ...(button.split ? { splitObjectNumber: numbers[at + 1]! } : {}),
        });
        at += button.split ? 2 : 1;
        // A create writes no flags: a hidden or locked button's copy gets them after.
        const flags = flagsToSet(button.row);
        if (Object.keys(flags).length > 0) {
          ops.push({ type: 'forms.updateWidget', widget: copy, patch: flags });
        }
        copyOf.set(annotationKey(button.row.ref), copy);
      }
      return {
        ops,
        copies: rows.flatMap((row) => copyOf.get(annotationKey(row.ref)) ?? []),
      };
    },
  };
}
