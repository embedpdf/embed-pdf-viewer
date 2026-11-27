/**
 * Design mode: the form's widgets, lent to the annotation plugin
 * (`AnnotationLender`, its host contract). While the session may design and
 * the active tool doesn't fill, the annotation plugin shows the widgets among
 * its records and edits them with its tools: select, move, resize, restyle,
 * reorder, delete. Each edit comes back here as the form's ops, in the same
 * change as the rest of it. While the tool fills, nothing is lent, and the
 * form layer draws and fills every widget. A widget of no size is never lent:
 * nobody can see it, so nobody should be able to select it by hand.
 *
 * Each lent widget carries its tint as its accent, `fields.tint` strong: its
 * field's group's color, so the annotation layer shows whose field it is, else
 * `fields.anyoneTintColor` for a field anyone fills in, else `fields.tintColor`
 * for a field in no group that takes a value. One with no
 * border of its own and no tint carries an outline in `fields.border`, so every
 * field shows. An empty one carries what it is for as its placeholder, as the
 * form layer shows it.
 *
 * A field tool's ghost is painted the same way (`toolPaintOf`): the field the
 * tool's click would place, drafted as the place handler drafts it and made
 * as `forms.create` makes it, with the same drawing, tint, outline and
 * placeholder as the field once placed: for anyone while the design target is.
 */
import { memo } from '@embedpdf/core';
import {
  refOf,
  type Effect,
  type LentPaint,
  type Model,
  type RecordAccent,
  type RecordOutline,
  type RecordPlaceholder,
} from '@embedpdf/core-annotation';
import {
  formFieldOfDraft,
  type AnnotationRef,
  type ChangeOp,
  type FormField,
  type PageRef,
  type WidgetAnnotation,
  type WidgetPatch,
} from '@embedpdf/engine-core/runtime';
import type { AnnotationLender } from '@embedpdf/plugin-annotation/contract/host';

import type { DuplicatePlacement } from './duplicate';
import { fieldForWidget, fieldKeyOf, hasArea, widgetRowOf } from '../model';
import { placeholderOf, takesValue } from '../read/fill-items';
import type { FormContext, FormServices } from '../services';
import { undoLookOf } from '../sync/predict';
import { toolDraft, toolLookOf } from '../tools/handlers';

/** The object numbers of the field a tool's ghost draws, and its box: never a real object's. */
const TOOL_FIELD = -1;
const TOOL_WIDGET = -2;

const objectNumberOf = (ref: AnnotationRef): number =>
  ref.kind === 'objectNumber' ? ref.objectNumber : -1;

export function createWidgetLender(
  ctx: FormContext,
  {
    fields,
    design,
    pictures,
    looks,
    groups,
    purposes,
    tools,
    siblings,
  }: Pick<
    FormServices,
    'fields' | 'design' | 'pictures' | 'looks' | 'groups' | 'purposes' | 'tools' | 'siblings'
  >,
  /** The ops that copy widgets by the designer's rule (write/fields.ts). */
  copyOps: (
    widgets: readonly AnnotationRef[],
    placement: DuplicatePlacement,
    values: boolean,
  ) => Promise<{ ops: readonly ChangeOp[]; copies: readonly AnnotationRef[] }>,
): AnnotationLender {
  // Listed again when a group's color, the tint, a purpose's label or the placeholders' color
  // changes: the records' accents and placeholders are read then.
  const records = memo(
    () =>
      [
        design.lending(),
        fields.get().snapshot,
        fields.view().snapshot,
        groups.list(),
        ctx.settings().get().fields.tint,
        ctx.settings().get().fields.tintColor,
        ctx.settings().get().fields.anyoneTintColor,
        ctx.settings().get().fields.border,
        purposes.list(),
        ctx.settings().get().fields.placeholder,
      ] as const,
    (lending, confirmed, shown) =>
      lending && confirmed && shown
        ? { confirmed: confirmed.widgets.filter(hasArea), shown: shown.widgets.filter(hasArea) }
        : null,
  );

  /**
   * Deleted widgets, as the form's ops: a widget leaves its field
   * (`deleteWidget`), and a field whose every widget goes is deleted whole
   * (a merged field and widget among them).
   */
  const deleteOps = (deleted: readonly WidgetAnnotation[]): ChangeOp[] => {
    const index = fields.view();
    const ops: ChangeOp[] = [];
    const byField = new Map<string, { field: FormField; widgets: WidgetAnnotation[] }>();
    for (const row of deleted) {
      const field = fieldForWidget(index, objectNumberOf(row.ref));
      if (!field) {
        ops.push({ type: 'forms.deleteWidget', widget: row.ref });
        continue;
      }
      const entry = byField.get(fieldKeyOf(field)) ?? { field, widgets: [] };
      entry.widgets.push(row);
      byField.set(fieldKeyOf(field), entry);
    }
    for (const { field, widgets } of byField.values()) {
      const going = new Set(widgets.map((row) => objectNumberOf(row.ref)));
      if (field.widgets.every((widget) => going.has(widget.objectNumber))) {
        ops.push({ type: 'forms.delete', field: field.ref });
      } else {
        ops.push(
          ...widgets.map((row): ChangeOp => ({ type: 'forms.deleteWidget', widget: row.ref })),
        );
      }
    }
    return ops;
  };

  /** A lent record's field and its row, as the view has them. */
  function lentOf(record: {
    ref: AnnotationRef;
  }): { field: FormField; row: WidgetAnnotation } | null {
    const view = fields.view();
    const number = objectNumberOf(record.ref);
    const field = fieldForWidget(view, number);
    const row = widgetRowOf(view, number);
    return field && row ? { field, row } : null;
  }

  /**
   * A field's tint while it is designed: its group's color, else `fields.anyoneTintColor` for a
   * field anyone fills in, else `fields.tintColor` for a field that takes a value; `null` for
   * none.
   */
  function tintIn(field: FormField): RecordAccent | null {
    return field.assignment.kind !== 'unassigned' || takesValue(field)
      ? groups.tintOf(field)
      : null;
  }

  /** The `fields.border` edge of a box with no border of its own and no tint, so it shows. */
  function outlineIn(row: WidgetAnnotation, tint: RecordAccent | null): RecordOutline | null {
    if (tint !== null || (row.color ?? null) !== null) return null;
    return { color: ctx.settings().get().fields.border };
  }

  /** What an empty box is for, in the placeholder color. */
  function placeholderIn(field: FormField, row: WidgetAnnotation): RecordPlaceholder | null {
    const text = placeholderOf(field, purposes.labelOf(field.purpose), row.hasMark);
    return text === null ? null : { text, color: ctx.settings().get().fields.placeholder };
  }

  /** Everything the lender paints over a box: a placed field's, and a tool's ghost's. */
  function paintOver(field: FormField, row: WidgetAnnotation): LentPaint {
    const tint = tintIn(field);
    const painter = looks.painterIn(row, field);
    const outline = outlineIn(row, tint);
    const placeholder = placeholderIn(field, row);
    return {
      ...(painter ? { painter } : {}),
      ...(tint ? { accent: tint } : {}),
      ...(outline ? { outline } : {}),
      ...(placeholder ? { placeholder } : {}),
    };
  }

  return {
    owner: 'form',
    records,
    opsOf(effects: readonly Effect[], model: Model, before: Model) {
      const ops: ChangeOp[] = [];
      const deleted: WidgetAnnotation[] = [];
      for (const effect of effects) {
        if (effect.type === 'patch') {
          const ref = refOf(model.byId[effect.id]);
          if (!ref) continue;
          const { subtype: _subtype, ...patch } = effect.patch as WidgetPatch & {
            subtype?: string;
          };
          ops.push({ type: 'forms.updateWidget', widget: ref, patch: patch as WidgetPatch });
        } else if (effect.type === 'delete') {
          const record = before.byId[effect.id];
          if (record) deleted.push(record.annotation as WidgetAnnotation);
        }
      }
      return [...ops, ...deleteOps(deleted)];
    },
    undoOf: (ops) => undoLookOf(fields.view(), ops),
    reorderOps: (page: PageRef, refs, position) => [
      { type: 'forms.reorderWidgets', page, widgets: [...refs], position },
    ],
    // By hand, a copy is the question, not what someone filled in.
    copyOps: (refs, placement) => copyOps(refs, placement, false),
    getAuthority: () => {
      const may = ctx.allows('doc.forms.modify');
      return { update: may, delete: may, copy: may };
    },
    // The pictures the form layer draws too, from one store: switching modes
    // fetches nothing, and a page's pictures change only with its widgets.
    getPictureEpoch: pictures.epoch,
    getPictureVersion: pictures.versionOf,
    renderAppearances: pictures.render,
    // A widget draws live, by the painter, while a gesture reshapes it, while its look isn't
    // confirmed (a restyle, a resize, a field just placed), and until its new picture is there.
    isPending: looks.isPending,
    accentOf: (record) => {
      const field = fieldForWidget(fields.view(), objectNumberOf(record.ref));
      return field ? tintIn(field) : null;
    },
    placeholderOf: (record) => {
      const lent = lentOf(record);
      return lent ? placeholderIn(lent.field, lent.row) : null;
    },
    outlineOf: (record) => {
      const lent = lentOf(record);
      return lent ? outlineIn(lent.row, tintIn(lent.field)) : null;
    },
    painter: (record) =>
      record.subtype === 'widget' ? looks.painterOf(record as WidgetAnnotation) : null,
    toolPaintOf: (toolId, page) => {
      const tool = tools.get(toolId);
      if (!tool) return null;
      // The field the tool's click places, as the place handler drafts it (the name never shows).
      const box = {
        x: 0,
        y: 0,
        width: tool.clickCreate?.width ?? 1,
        height: tool.clickCreate?.height ?? 1,
      };
      const draft = toolDraft(
        tool,
        tool.fieldKind,
        { page, rect: box, ...toolLookOf(tool, siblings.annotation()) },
        ctx.state.get().designAssignment,
      );
      const made = formFieldOfDraft(draft, {
        objectNumber: TOOL_FIELD,
        widgets: [{ kind: 'objectNumber', page, objectNumber: TOOL_WIDGET }],
      });
      const row = made.widgets[0];
      return row ? paintOver(made.field, row) : null;
    },
  };
}
