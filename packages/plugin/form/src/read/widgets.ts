/**
 * The widget plane's reads: per-page widget geometry (one annotations read
 * per page, lazily), the fused fill projection (memoized per model.seq) and
 * the hit test.
 */
import type { PageRef, PdfRect } from '@embedpdf/engine-core/runtime';

import {
  fillItemForWidget as coreFillItemForWidget,
  fillItems as coreFillItems,
  type FillItem,
} from '../core/fill-items';
import {
  fieldForWidget as coreFieldForWidget,
  widgetAt as coreWidgetAt,
  type Box,
  type WidgetHit,
} from '../core/model';
import type { FormHostCapability } from '../host-contract';
import type { FormContext, FormServices } from '../services';

export function createWidgetReads(
  ctx: FormContext,
  { store, authority, siblings }: Pick<FormServices, 'store' | 'authority' | 'siblings'>,
) {
  const { model, apply } = store;
  const { can } = authority;
  const annotationHost = siblings.annotation;

  // ── widget geometry (from the WIDGET plane: one annotations read/page) ──
  const geomLoading = new Set<number>();
  const ensureGeom = (page: PageRef): void => {
    const doc = ctx.doc;
    const pon = page.pageObjectNumber;
    if (!doc || geomLoading.has(pon) || model().geom[pon]) return;
    // The kernel's page geometry: the one PDF ↔ page conversion.
    const space = ctx.geometry.tryForPage(page);
    if (!space) return;
    geomLoading.add(pon);
    void doc
      .page(page)
      .annotations.list()
      .then(({ annotations }) => {
        const boxes: Record<number, Box> = {};
        for (const dto of annotations) {
          if (dto.subtype !== 'widget') continue;
          const objectNumber = dto.ref.kind === 'objectNumber' ? dto.ref.annotObjectNumber : 0;
          if (objectNumber > 0) boxes[objectNumber] = space.pdfRectToPage(dto.rect);
        }
        apply({ t: 'pageGeom', pageObjectNumber: pon, boxes });
      })
      .finally(() => {
        geomLoading.delete(pon);
      });
  };

  // ── widget hit test ─────────────────────────────────────────────────────
  // The model's geometry when the page has it (and kick the lazy load so the
  // next call does); otherwise the annotation plane's live boxes — it is
  // whole-document hydrated, so a first click on a page already resolves.
  const widgetAt = (page: PageRef, point: { x: number; y: number }): WidgetHit | null => {
    const m = model();
    const pon = page.pageObjectNumber;
    ensureGeom(page);
    if (m.geom[pon]) return coreWidgetAt(m, pon, point);
    if (!annotationHost) return null;
    let best: WidgetHit | null = null;
    for (const item of annotationHost.listPageItems(page)) {
      if (!item.subtype.startsWith('widget') || item.ref?.kind !== 'objectNumber') continue;
      const box = item.box;
      const inside =
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height;
      if (!inside) continue;
      const field = coreFieldForWidget(m, item.ref.annotObjectNumber);
      if (!field) continue;
      if (!best || box.width * box.height < best.box.width * best.box.height) {
        best = { annotObjectNumber: item.ref.annotObjectNumber, field, box };
      }
    }
    return best;
  };

  // ── memoized fill projection ────────────────────────────────────────────
  // Session fill authority FUSES into the same `disabled` the field's
  // ReadOnly flag feeds (permissions.md: authority rides the flags gate) —
  // without `doc.forms.fill` every widget renders inert, so the pixels are
  // truthful and no gesture reaches a doomed write.
  const fuseFill = (item: FillItem | null, fillable: boolean): FillItem | null =>
    item === null || fillable || item.disabled ? item : { ...item, disabled: true };

  const fillCache = new Map<number, { seq: number; fillable: boolean; items: FillItem[] }>();
  const fillItems = (page: PageRef): FillItem[] => {
    const m = model();
    const pon = page.pageObjectNumber;
    const fillable = can('doc.forms.fill');
    const hit = fillCache.get(pon);
    if (hit && hit.seq === m.seq && hit.fillable === fillable) return hit.items;
    const items = coreFillItems(m, pon).map((item) => fuseFill(item, fillable) as FillItem);
    fillCache.set(pon, { seq: m.seq, fillable, items });
    return items;
  };

  // Single-widget projection — reference-stable per model.seq so framework
  // selectors can use plain identity equality.
  const fillItemCache = new Map<
    number,
    { seq: number; fillable: boolean; item: FillItem | null }
  >();
  const fillItem = (annotObjectNumber: number): FillItem | null => {
    const m = model();
    const fillable = can('doc.forms.fill');
    const hit = fillItemCache.get(annotObjectNumber);
    if (hit && hit.seq === m.seq && hit.fillable === fillable) return hit.item;
    const item = fuseFill(coreFillItemForWidget(m, annotObjectNumber), fillable);
    fillItemCache.set(annotObjectNumber, { seq: m.seq, fillable, item });
    return item;
  };

  /** The page's content box (`{0,0,w,h}`), for page-bound placement math. */
  const pageBox = (page: PageRef): Box | null => {
    const space = ctx.geometry.tryForPage(page);
    return space ? { x: 0, y: 0, width: space.width, height: space.height } : null;
  };

  return {
    fillItems,
    pageBox,
    api: {
      listFillItems: fillItems,
      getFillItem: fillItem,
      ensureLoaded: ensureGeom,
      getWidgetAt: widgetAt,
      getPageBox: pageBox,
      listWidgets: fillItems,
    } satisfies Partial<FormHostCapability>,
  };
}
