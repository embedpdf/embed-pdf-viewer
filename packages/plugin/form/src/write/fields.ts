/**
 * Design mode: fields and widgets are created, patched, deleted, attached and
 * detached through `doc.forms`. The fields and widget-geometry mirrors apply
 * the confirmed results, and the annotation plugin applies the widget changes
 * from the same events.
 */
import { PluginError } from '@embedpdf/core';
import type {
  AnnotationRef,
  FormFieldDraft,
  FormFieldRef,
  PageRef,
} from '@embedpdf/engine-core/runtime';

import type { CreatedField, CreateFieldInput, FormCapability } from '../contract';
import type { Box } from '../model';
import type { FormContext, FormServices } from '../services';

export function createFieldWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'fields' | 'siblings' | 'enqueue'>,
  widgets: { getPageBox(page: PageRef): Box | null },
) {
  const { fields, enqueue } = services;
  const annotationHost = services.siblings.annotation;
  const { getPageBox } = widgets;

  /** A deterministic, collision-free name: `text_1`, `text_2`, … against the current fields. */
  const autoName = (family: string): string => {
    const names = new Set((fields.get().snapshot?.fields ?? []).map((field) => field.name));
    let count = 1;
    while (names.has(`${family}_${count}`)) count++;
    return `${family}_${count}`;
  };

  const placeField = async (input: CreateFieldInput): Promise<CreatedField> => {
    const page = input.page;
    const space = ctx.geometry.tryForPage(page);
    const bounds = getPageBox(page);
    if (!space || !bounds) {
      throw new PluginError('not-ready', 'form', 'createField: the page is not laid out');
    }
    // Placement is page-bound: intersect a (possibly overshooting) drag box
    // with the page. Sizing is the caller's job (the place handler's click
    // policy or drag rectangle); a degenerate result is a caller bug.
    const x = Math.max(bounds.x, Math.min(input.bounds.x, bounds.width));
    const y = Math.max(bounds.y, Math.min(input.bounds.y, bounds.height));
    const box: Box = {
      x,
      y,
      width: Math.max(0, Math.min(input.bounds.x + input.bounds.width, bounds.width) - x),
      height: Math.max(0, Math.min(input.bounds.y + input.bounds.height, bounds.height) - y),
    };
    if (box.width < 1 || box.height < 1) {
      throw new PluginError(
        'invalid-input',
        'form',
        'createField: degenerate bounds (size the box before placing)',
      );
    }
    const { family, appearance } = input;
    const name = input.name ?? autoName(family);
    const placement = {
      page,
      rect: space.pageRectToPdf(box),
      ...(appearance ? { appearance } : {}),
    };
    const draft: FormFieldDraft =
      family === 'radio'
        ? { family, name, widgets: [{ ...placement, onState: 'option1' }] }
        : family === 'combobox' || family === 'listbox'
          ? {
              family,
              name,
              widget: placement,
              options: input.options
                ? input.options.map((option) => ({ ...option }))
                : [
                    { label: 'Option 1', value: 'Option 1' },
                    { label: 'Option 2', value: 'Option 2' },
                  ],
            }
          : { family, name, widget: placement };
    const result = await ctx.doc.forms.create(draft);
    // Wait for the annotation plugin to read the new widget, so a caller can
    // select it right away.
    if (annotationHost) await annotationHost.whenSynced();
    const widget =
      result.field.widgets.find(
        (candidate) => candidate.page?.pageObjectNumber === page.pageObjectNumber,
      ) ?? null;
    return { field: result.field, widget };
  };

  return {
    api: {
      createField: (input) => enqueue(() => placeField(input)),
      updateField: (ref, patch) =>
        enqueue(async () => {
          await ctx.doc.forms.update(ref, patch);
        }),
      deleteField: (ref) =>
        enqueue(async () => {
          await ctx.doc.forms.delete(ref);
        }),
      detachWidget: (ref, widget) =>
        enqueue(async () => {
          await ctx.doc.forms.removeWidget(ref, widget);
        }),
      attachWidget: (ref, widget) =>
        enqueue(async () => {
          await ctx.doc.forms.addWidget(ref, widget);
        }),
    } satisfies Partial<FormCapability>,
  };
}
