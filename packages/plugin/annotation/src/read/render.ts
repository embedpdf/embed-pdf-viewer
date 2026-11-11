import {
  groupOf,
  isSubstrateOnly,
  type Model,
  type ModelAnnotation,
  pageItems as corePageItems,
  refOf,
  type RenderItem,
  shapeOf,
  viewable,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  imageSourceOfBytes,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { FontsToken } from '@embedpdf/plugin-fonts/contract';
import {
  RenderToken as RenderHostToken,
  type AppearanceFamily,
  type AppearanceItem,
  type AppearancePicture,
} from '@embedpdf/plugin-render/contract/host';

import type { LinkNavItem, TextItem } from '../contract';
import type { AnnotationAppearancePicture } from '../host-contract';
import type { AnnotationModel } from '../model';
import type { AnnotationContext, AnnotationServices } from '../services';
import { buildTextItem, buildTextItems } from '../text-item';
import type { Ghost } from '../tools/ghost';
import type { Stamps } from '../write/stamps';

/**
 * What a page paints: the vector items (drafts, previews and the tool's
 * ghost ride the same pipeline), the editable text items, the navigable link
 * areas, and the baked-appearance seam (epoch and pictures). The engine's
 * pictures come through the render plugin, which shares and keeps them. A
 * stamp this session placed shows the preview it was placed with until the
 * engine's picture of it exists, an annotation an undo brings back the
 * picture it had, and a copy of a stamp its original's.
 */
export function createRenderReads(
  ctx: Pick<AnnotationContext, 'state' | 'document' | 'doc' | 'tryGet'>,
  {
    view: { pageModel },
    lending,
    records,
    copySources,
    fonts: fontLookup,
    textFonts,
  }: Pick<
    AnnotationServices,
    'view' | 'lending' | 'records' | 'copySources' | 'fonts' | 'textFonts'
  >,
  ghost: Pick<Ghost, 'itemsOn'>,
  stamps: Pick<Stamps, 'lookOf'>,
) {
  const itemsCache = new Map<
    number,
    {
      model: Model;
      ghostAt: AnnotationModel['ghostAt'];
      placing: AnnotationModel['placing'];
      zoom: number | undefined;
      rotation: number | undefined;
      fontsEpoch: number;
      v: RenderItem[];
    }
  >();
  const fonts = () => ctx.tryGet(FontsToken);
  /**
   * A hovered redaction's label with the fonts its preview draws it in, as
   * the engine picks them for the label's font; without the fonts plugin, or
   * while it finds them, the label's standard font draws it.
   */
  const withLabelFonts = (item: RenderItem): RenderItem => {
    if (!item.hovered || !item.label) return item;
    const labelFonts = fonts()?.getPaintFonts(
      item.text?.fontFamily ?? 'helvetica',
      item.label.text,
    );
    return labelFonts ? { ...item, label: { ...item.label, fonts: labelFonts } } : item;
  };
  const pageItemsOf = (page: PageRef, view?: ViewEnv): RenderItem[] => {
    const pageObjectNumber = page.objectNumber;
    const model = pageModel(pageObjectNumber);
    // The ghost and a sibling's placement count for their own page only, so
    // a ghost following the pointer recomputes that page alone.
    const state = ctx.state.get();
    const ghostAt = state.ghostAt?.page.objectNumber === pageObjectNumber ? state.ghostAt : null;
    const placing = state.placing?.page.objectNumber === pageObjectNumber ? state.placing : null;
    const fontsEpoch = fonts()?.getPaintFontsEpoch() ?? 0;
    const cached = itemsCache.get(pageObjectNumber);
    if (
      cached &&
      cached.model === model &&
      cached.ghostAt === ghostAt &&
      cached.placing === placing &&
      cached.zoom === view?.zoom &&
      cached.rotation === view?.rotation &&
      cached.fontsEpoch === fontsEpoch
    )
      return cached.v;
    // The tool's ghost and a sibling's placement paint on top, as the
    // annotations they will be (tools/ghost.ts).
    const items = [
      ...corePageItems(model, page, view).map(withLabelFonts),
      ...ghost.itemsOn(pageObjectNumber, model, view),
    ];
    itemsCache.set(pageObjectNumber, {
      model,
      ghostAt,
      placing,
      zoom: view?.zoom,
      rotation: view?.rotation,
      fontsEpoch,
      v: items,
    });
    return items;
  };

  const textsCache = new Map<
    number,
    {
      model: Model;
      zoom: number | undefined;
      rotation: number | undefined;
      fonts: object;
      v: TextItem[];
    }
  >();
  const textItemsOf = (page: PageRef, view?: ViewEnv): TextItem[] => {
    const pageObjectNumber = page.objectNumber;
    const model = pageModel(pageObjectNumber);
    const fonts = textFonts.version();
    const cached = textsCache.get(pageObjectNumber);
    if (
      cached &&
      cached.model === model &&
      cached.zoom === view?.zoom &&
      cached.rotation === view?.rotation &&
      cached.fonts === fonts
    )
      return cached.v;
    const items = buildTextItems(model, page, view, { lookup: fontLookup, text: textFonts });
    textsCache.set(pageObjectNumber, {
      model: model,
      zoom: view?.zoom,
      rotation: view?.rotation,
      fonts,
      v: items,
    });
    return items;
  };

  // One free text's item whatever its state, for a renderer that draws the
  // box itself: the page list has only live text. Memoized by its page's
  // slice of the model, like the list.
  const textCache = new Map<
    string,
    {
      model: Model;
      zoom: number | undefined;
      rotation: number | undefined;
      fonts: object;
      v: TextItem | null;
    }
  >();
  const textItemOf = (ref: AnnotationRef, view?: ViewEnv): TextItem | null => {
    const key = annotationKey(ref);
    const model = pageModel(ref.page.objectNumber);
    const fonts = textFonts.version();
    const cached = textCache.get(key);
    if (
      cached &&
      cached.model === model &&
      cached.zoom === view?.zoom &&
      cached.rotation === view?.rotation &&
      cached.fonts === fonts
    )
      return cached.v;
    const item = buildTextItem(model, key, view, { lookup: fontLookup, text: textFonts });
    textCache.set(key, { model, zoom: view?.zoom, rotation: view?.rotation, fonts, v: item });
    return item;
  };

  // The navigation plane's feed: clickable link areas per page — standalone
  // links + attached-link segments (rects derived by the reconciler's own
  // rule). Memoized by the page's slice of the model for selector use.
  const linkItemsCache = new Map<number, { model: Model; v: LinkNavItem[] }>();
  const linkItemsOf = (pageObjectNumber: number): LinkNavItem[] => {
    const model = pageModel(pageObjectNumber);
    const cached = linkItemsCache.get(pageObjectNumber);
    if (cached && cached.model === model) return cached.v;
    const items: LinkNavItem[] = [];
    for (const id of model.order) {
      const record = model.byId[id];
      const annotation = record?.annotation;
      if (
        !annotation ||
        annotation.page.objectNumber !== pageObjectNumber ||
        annotation.subtype !== 'link'
      )
        continue;
      if (!viewable(annotation, false)) continue; // hidden links don't navigate
      // A standalone link and an attached child both carry their own target.
      // Rects are the link's own committed geometry — anchors render only in
      // view contexts, where nothing is mid-gesture, so no live
      // parent-derivation is needed.
      const target = annotation.target ?? null;
      const geometry = shapeOf(annotation);
      if (target == null || geometry.kind !== 'box') continue;
      const activate = annotation.actions?.activate;
      const ref = refOf(record) ?? undefined;
      const hoverEnter = Boolean(annotation.actions?.cursorEnter?.root);
      const hoverExit = Boolean(annotation.actions?.cursorExit?.root);
      items.push({
        id,
        bounds: geometry.box,
        target,
        attached: groupOf(annotation) !== undefined,
        ...(activate ? { activate } : {}),
        ...(ref ? { ref } : {}),
        ...(hoverEnter || hoverExit ? { hoverEvents: { enter: hoverEnter, exit: hoverExit } } : {}),
      });
    }
    linkItemsCache.set(pageObjectNumber, { model: model, v: items });
    return items;
  };

  const api = {
    listPageItems: (page: PageRef, view?: ViewEnv) => pageItemsOf(page, view),
    listTextItems: (page: PageRef, view?: ViewEnv) => textItemsOf(page, view),
    getTextItem: (ref: AnnotationRef, view?: ViewEnv) => textItemOf(ref, view),
    listLinkItems: (page: PageRef) => linkItemsOf(page.objectNumber),
    getAppearanceEpoch: (page: PageRef) => {
      const { engine, placed, lent } = epochOf(page);
      const drawn = engine
        .map((item) => `${annotationKey(item.ref)}@${item.version}`)
        .sort()
        .join('|');
      return [drawn, placed, lent].filter(Boolean).join('|');
    },
    renderAppearances: (
      page: PageRef,
      scale: number,
      signal?: AbortSignal,
    ): Promise<AnnotationAppearancePicture[]> =>
      Promise.all([
        enginePictures(page, scale, epochOf(page).engine, signal),
        lentPictures(page, scale, signal),
        ownPictures(page, scale),
      ]).then(([theirs, lent, placed]) => [...theirs, ...lent, ...placed]),
  };

  /**
   * What a page's pictures depend on, and nothing else. `engine`: the
   * annotations the engine draws on it, each at its picture version
   * (`pictureVersion`, which advances when the engine confirms a re-bake).
   * `placed`: the stamps this session placed that the engine hasn't written
   * yet, which show the preview they were placed with (`previewOf`), and
   * the records an undo brought back or a copy made, which show the pictures
   * kept of them or of their original (`keptOf`). Position,
   * rotation and the state shown are absent: the blit translates (`apBox`)
   * and turns (`apRot`) the same pixels, and every state is held, so a move,
   * a spin or a switch costs no new picture. `lent`: the lender's epoch for
   * its records' pictures, when the page shows any of them.
   */
  const epochOf = (page: PageRef): { engine: AppearanceItem[]; placed: string; lent: string } => {
    const pageObjectNumber = page.objectNumber;
    const model = pageModel(pageObjectNumber);
    const engine: AppearanceItem[] = [];
    const placed: string[] = [];
    let lentShown = false;
    for (const id of model.order) {
      const record = model.byId[id];
      if (
        !record ||
        record.annotation.page.objectNumber !== pageObjectNumber ||
        record.source !== 'baked'
      )
        continue;
      // Conversation-plane annotations never paint — a remote reply or
      // status change must not churn the page's raster cache key.
      if (isSubstrateOnly(record)) continue;
      if (record.unconfirmed) {
        if (previewOf(record)) placed.push(`${id}@placed`);
        else if (keptOf(record).length) placed.push(`${id}@kept`);
        continue;
      }
      if (lending.owns(id)) {
        lentShown = true;
        continue;
      }
      engine.push({ ref: record.annotation.ref, version: record.pictureVersion ?? 0 });
    }
    const lender = lending.lender();
    return {
      engine,
      placed: placed.sort().join('|'),
      lent: lentShown && lender ? `lent:${lender.getPictureEpoch(page)}` : '',
    };
  };

  /** The lender's pictures of its records on `page`, in every state, at their picture versions. */
  const lentPictures = (
    page: PageRef,
    scale: number,
    signal?: AbortSignal,
  ): Promise<readonly AnnotationAppearancePicture[]> => {
    const lender = lending.lender();
    const model = pageModel(page.objectNumber);
    const lends = model.order.some((id) => lending.owns(id) && !model.byId[id]!.unconfirmed);
    if (!lender || !lends) return Promise.resolve([]);
    return lender.renderAppearances(page, scale, signal).catch(() => []);
  };

  /** The engine's pictures of the page's annotations, through the render plugin; none without it. */
  const enginePictures = (
    page: PageRef,
    scale: number,
    items: readonly AppearanceItem[],
    signal?: AbortSignal,
  ): Promise<readonly AnnotationAppearancePicture[]> => {
    const render = ctx.tryGet(RenderHostToken);
    if (!render || !ctx.doc || items.length === 0) return Promise.resolve([]);
    return render
      .renderAppearances(page, {
        family: 'annotations',
        scale,
        items,
        ...(signal ? { signal } : {}),
      })
      .catch(() => []);
  };

  /** The family whose pictures a record's are: the lender's widgets, or annotations. */
  const familyOf = (id: string): AppearanceFamily => (lending.owns(id) ? 'widgets' : 'annotations');

  /**
   * The annotations a copy the engine hasn't written stands in for, nearest
   * first: the one it copies, then, while that one is such a copy too, the
   * one behind it, and last the source noted when the copy was staged
   * (services/copy-sources.ts), which still holds once the engine wrote a
   * copy in between. A copy of a copy finds its look this way.
   */
  const originalsOf = (id: string): AnnotationRef[] => {
    const { byKey } = records.view();
    const originals: AnnotationRef[] = [];
    const seen = new Set([id]);
    let next = byKey[id]?.copyOf;
    while (next && !seen.has(annotationKey(next))) {
      seen.add(annotationKey(next));
      originals.push(next);
      next = byKey[annotationKey(next)]?.copyOf;
    }
    const noted = copySources.of(id);
    if (noted && !seen.has(annotationKey(noted))) originals.push(noted);
    return originals;
  };

  /**
   * The preview a record the engine hasn't written shows: the one it was
   * placed with (a stamp this session placed), or, for a copy of a stamp
   * that is still being placed, that stamp's.
   */
  const previewOf = (record: ModelAnnotation): ReturnType<Stamps['lookOf']> => {
    const own = stamps.lookOf(record);
    if (own || !record.unconfirmed) return own;
    for (const original of originalsOf(record.id)) {
      const placed = pageModel(original.page.objectNumber).byId[annotationKey(original)];
      const look = placed ? stamps.lookOf(placed) : null;
      if (look) return look;
    }
    return null;
  };

  /**
   * The pictures a record the engine hasn't written shows when it has no
   * live drawing: the engine's last pictures of it, kept a while after it
   * left its page (an undo brings it back), or, for a copy, the ones of the
   * annotation it copies, where the copy is.
   */
  const keptOf = (record: ModelAnnotation): readonly AppearancePicture[] => {
    const render = ctx.tryGet(RenderHostToken);
    if (!render) return [];
    const { ref } = record.annotation;
    const own = render.getKeptAppearances(familyOf(record.id), ref);
    if (own.length) return own;
    for (const original of originalsOf(record.id)) {
      const kept = render.getKeptAppearances('annotations', original);
      if (kept.length) {
        return kept.map((each) => ({ ...each, ref, rect: record.apBox ?? each.rect }));
      }
    }
    return [];
  };

  /**
   * The pictures of what shows on `page` that the engine hasn't written yet:
   * a stamp this session placed shows its preview, at the size the page shows
   * it, in its box (before its turn, which the layer puts back, as for the
   * engine's); an annotation an undo brings back shows the picture it had.
   */
  const ownPictures = async (
    page: PageRef,
    scale: number,
  ): Promise<AnnotationAppearancePicture[]> => {
    const model = pageModel(page.objectNumber);
    const pictures = model.order.map(async (id): Promise<AnnotationAppearancePicture[]> => {
      const record = model.byId[id]!;
      if (!record.unconfirmed) return [];
      const version = record.pictureVersion ?? 0;
      const look = previewOf(record);
      // Brought back as it was: the pictures kept of it are its look.
      if (!look) return keptOf(record).map((kept) => ({ ...kept, version }));
      const rect = record.apBox;
      if (!rect) return [];
      const preview = await look(rect.width * scale);
      if (!preview) return [];
      return [
        {
          ref: record.annotation.ref,
          mode: 'normal',
          state: null,
          rect,
          image: imageSourceOfBytes(preview.bytes, preview.mimeType ?? 'image/png'),
          version,
        },
      ];
    });
    return (await Promise.all(pictures)).flat();
  };

  return { api };
}
