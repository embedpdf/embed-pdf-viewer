/** Design mode: fields and widgets are created, patched, deleted, attached
 *  and detached through `doc.forms`; the widget plane is nudged to re-read
 *  pages whose widget population changed. */
import { PluginError } from '@embedpdf/core';
import type {
  AnnotationRef,
  FormFieldDraft,
  FormFieldPatch,
  FormFieldRef,
  PageRef,
  PdfRect,
} from '@embedpdf/engine-core/runtime';

import type { CreatedField, CreateFieldInput, FormCapability } from '../contract';
import { fieldByKey, type Box } from '../core/model';
import type { FormContext, FormServices } from '../services';
import type { FormHydration } from '../sync/hydration';

export function createFieldWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'store' | 'siblings' | 'enqueue'>,
  hydration: FormHydration,
  widgets: { pageBox(page: PageRef): Box | null },
) {
  const { model, apply, keyOf } = services.store;
  const annotationHost = services.siblings.annotation;
  const enqueueMutation = services.enqueue;
  const { refresh } = hydration;
  const { pageBox } = widgets;

  const nudgeAnnotations = (pages: Iterable<PageRef>): void => {
    if (!annotationHost) return;
    const seen = new Set<number>();
    for (const page of pages) {
      if (seen.has(page.pageObjectNumber)) continue;
      seen.add(page.pageObjectNumber);
      void annotationHost.reloadPage(page);
    }
  };

  /** Deterministic, collision-free auto-name: `text_1`, `text_2`, … counted
   *  against the CURRENT snapshot (rename in the field panel). */
  const autoName = (family: string): string => {
    const names = new Set((model().snapshot?.fields ?? []).map((f) => f.name));
    let n = 1;
    while (names.has(`${family}_${n}`)) n++;
    return `${family}_${n}`;
  };

  const placeField = async (input: CreateFieldInput): Promise<CreatedField> => {
    const doc = ctx.doc;
    const page = input.page;
    const pon = page.pageObjectNumber;
    const space = ctx.geometry.tryForPage(page);
    if (!doc || !space) {
      throw new PluginError('not-ready', 'form', 'createField: document/page not ready');
    }
    // Placement is page-bound: intersect a (possibly overshooting) drag box
    // with the page. Sizing policy is the CALLER's job (the place handler's
    // click policy / drag rect) — a degenerate result is a caller bug.
    const bounds = pageBox(page)!;
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
                ? input.options.map((o) => ({ ...o }))
                : [
                    { label: 'Option 1', value: 'Option 1' },
                    { label: 'Option 2', value: 'Option 2' },
                  ],
            }
          : { family, name, widget: placement };
    const result = await doc.forms.createField(draft);
    await refresh();
    apply({ t: 'clearGeom', pageObjectNumber: pon });
    // AWAIT the annotation-plane reload so the returned widget ref is already
    // selectable — the caller's auto-select needs the model to know it.
    if (annotationHost) await annotationHost.reloadPage(page);
    const widget = result.field.widgets.find((w) => w.page?.pageObjectNumber === pon) ?? null;
    return { field: result.field, widget };
  };

  const patchField = async (ref: FormFieldRef, patch: FormFieldPatch): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    await doc.forms.updateField(ref, patch);
    await refresh();
  };

  const removeField = async (ref: FormFieldRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    const field = fieldByKey(model(), keyOf(ref));
    const pages = field?.widgets.flatMap((w) => (w.page ? [w.page] : [])) ?? [];
    await doc.forms.deleteField(ref);
    await refresh();
    for (const pon of new Set(pages.map((p) => p.pageObjectNumber))) {
      apply({ t: 'clearGeom', pageObjectNumber: pon });
    }
    nudgeAnnotations(pages);
  };

  const detachFromField = async (ref: FormFieldRef, widget: AnnotationRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    await doc.forms.detachWidget(ref, widget);
    await refresh();
    apply({ t: 'clearGeom', pageObjectNumber: widget.page.pageObjectNumber });
    nudgeAnnotations([widget.page]);
  };
  const attachToField = async (ref: FormFieldRef, widget: AnnotationRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    await doc.forms.attachWidget(ref, widget);
    await refresh();
    apply({ t: 'clearGeom', pageObjectNumber: widget.page.pageObjectNumber });
    nudgeAnnotations([widget.page]);
  };

  return {
    api: {
      createField: (input) => enqueueMutation(() => placeField(input)),
      updateField: (ref, patch) => enqueueMutation(() => patchField(ref, patch)),
      deleteField: (ref) => enqueueMutation(() => removeField(ref)),
      detachWidget: (ref, widget) => enqueueMutation(() => detachFromField(ref, widget)),
      attachWidget: (ref, widget) => enqueueMutation(() => attachToField(ref, widget)),
    } satisfies Partial<FormCapability>,
  };
}
