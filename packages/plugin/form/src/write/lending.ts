/**
 * Design mode: the form's widgets, lent to the annotation plugin
 * (`AnnotationLender`, its host contract). While the session may design and
 * the active tool doesn't fill, the annotation plugin shows the widgets among
 * its records and edits them with its tools: select, move, resize, restyle,
 * reorder, delete. Each edit comes back here as the form's ops, in the same
 * change as the rest of it. While the tool fills, nothing is lent, and the
 * form layer draws and fills every widget.
 */
import { memo } from '@embedpdf/core';
import { refOf, type Effect, type Model } from '@embedpdf/core-annotation';
import {
  type AnnotationRef,
  type ChangeOp,
  type FormFieldDTO,
  type PageRef,
  type WidgetAnnotation,
  type WidgetPatch,
} from '@embedpdf/engine-core/runtime';
import type { AnnotationLender } from '@embedpdf/plugin-annotation/contract/host';

import { fieldForWidget, fieldKeyOf } from '../model';
import type { FormContext, FormServices } from '../services';
import { undoLookOf } from '../sync/predict';

const objectNumberOf = (ref: AnnotationRef): number =>
  ref.kind === 'objectNumber' ? ref.objectNumber : -1;

export function createWidgetLender(
  ctx: FormContext,
  { fields, design, siblings }: Pick<FormServices, 'fields' | 'design' | 'siblings'>,
): AnnotationLender {
  const { render } = siblings;
  const records = memo(
    () => [design.lending(), fields.get().snapshot, fields.view().snapshot] as const,
    (lending, confirmed, shown) =>
      lending && confirmed && shown ? { confirmed: confirmed.widgets, shown: shown.widgets } : null,
  );

  /**
   * Deleted widgets, as the form's ops: a widget leaves its field
   * (`deleteWidget`), and a field whose every widget goes is deleted whole
   * (a merged field and widget among them).
   */
  const deleteOps = (deleted: readonly WidgetAnnotation[]): ChangeOp[] => {
    const index = fields.view();
    const ops: ChangeOp[] = [];
    const byField = new Map<string, { field: FormFieldDTO; widgets: WidgetAnnotation[] }>();
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
    authority: () => {
      const may = ctx.allows('doc.forms.modify');
      return { update: may, delete: may };
    },
    // The pictures the form layer draws too, from one store: switching modes
    // fetches nothing, and a page's pictures change only with its widgets.
    pictureEpoch: (page) => String(render?.getFieldAppearanceEpoch(page) ?? 0),
    renderAppearances: (page, scale, signal) =>
      render
        ? render.renderFieldAppearances(page, { scale, ...(signal ? { signal } : {}) })
        : Promise.resolve([]),
  };
}
