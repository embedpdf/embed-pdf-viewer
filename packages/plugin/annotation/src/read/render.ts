import { CONTINUOUS_RENDER_POLICY, snapAppearanceScale } from '@embedpdf/core';
import {
  groupOf,
  isSubstrateOnly,
  type Model,
  pageItems as corePageItems,
  refOf,
  type RenderItem,
  shapeOf,
  viewable,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import {
  imageSourceOfBytes,
  shownAppearances,
  type DocumentHandle,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { LinkNavItem, TextItem } from '../contract';
import type { AnnotationAppearancePicture } from '../host-contract';
import type { AnnotationState } from '../model';
import type { AnnotationContext, AnnotationServices } from '../services';
import { buildTextItems } from '../text-item';
import type { Ghost } from '../tools/ghost';
import type { Stamps } from '../write/stamps';

/**
 * What a page paints: the vector items (drafts, previews and the tool's
 * ghost ride the same pipeline), the editable text items, the navigable link
 * areas, and the baked-appearance seam (epoch, bake scale, rasters). A stamp
 * this session placed shows the preview it was placed with until the
 * engine's picture of it exists.
 */
export function createRenderReads(
  ctx: Pick<AnnotationContext, 'state' | 'document' | 'doc'>,
  { view: { pageModel } }: Pick<AnnotationServices, 'view'>,
  ghost: Pick<Ghost, 'itemsOn'>,
  stamps: Pick<Stamps, 'lookOf'>,
) {
  const itemsCache = new Map<
    number,
    {
      model: Model;
      ghostAt: AnnotationState['ghostAt'];
      placing: AnnotationState['placing'];
      zoom: number | undefined;
      rotation: number | undefined;
      v: RenderItem[];
    }
  >();
  const pageItemsOf = (page: PageRef, view?: ViewEnv): RenderItem[] => {
    const pageObjectNumber = page.objectNumber;
    const model = pageModel(pageObjectNumber);
    // The ghost and a sibling's placement count for their own page only, so
    // a ghost following the pointer recomputes that page alone.
    const state = ctx.state.get();
    const ghostAt = state.ghostAt?.page.objectNumber === pageObjectNumber ? state.ghostAt : null;
    const placing = state.placing?.page.objectNumber === pageObjectNumber ? state.placing : null;
    const cached = itemsCache.get(pageObjectNumber);
    if (
      cached &&
      cached.model === model &&
      cached.ghostAt === ghostAt &&
      cached.placing === placing &&
      cached.zoom === view?.zoom &&
      cached.rotation === view?.rotation
    )
      return cached.v;
    // The tool's ghost and a sibling's placement paint on top, as the
    // annotations they will be (tools/ghost.ts).
    const items = [
      ...corePageItems(model, page, view),
      ...ghost.itemsOn(pageObjectNumber, model, view),
    ];
    itemsCache.set(pageObjectNumber, {
      model,
      ghostAt,
      placing,
      zoom: view?.zoom,
      rotation: view?.rotation,
      v: items,
    });
    return items;
  };

  const textsCache = new Map<
    number,
    { model: Model; zoom: number | undefined; rotation: number | undefined; v: TextItem[] }
  >();
  const textItemsOf = (page: PageRef, view?: ViewEnv): TextItem[] => {
    const pageObjectNumber = page.objectNumber;
    const model = pageModel(pageObjectNumber);
    const cached = textsCache.get(pageObjectNumber);
    if (
      cached &&
      cached.model === model &&
      cached.zoom === view?.zoom &&
      cached.rotation === view?.rotation
    )
      return cached.v;
    const items = buildTextItems(model, page, view);
    textsCache.set(pageObjectNumber, {
      model: model,
      zoom: view?.zoom,
      rotation: view?.rotation,
      v: items,
    });
    return items;
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
    listLinkItems: (page: PageRef) => linkItemsOf(page.objectNumber),
    getAppearanceEpoch: (page: PageRef) => {
      const { engine, placed } = epochOf(page);
      return [engine, placed].filter(Boolean).join('|');
    },
    getBakeScale: (renderScale: number) =>
      // The render policy is a document fact off the kernel registry (like
      // `pages`), interpreted by the pure engine-core helper — one lifecycle,
      // one interpretation, no plugin dependency. Identity under continuous.
      snapAppearanceScale(ctx.document()?.renderPolicy ?? CONTINUOUS_RENDER_POLICY, renderScale),
    renderAppearances: (
      page: PageRef,
      scale: number,
      signal?: AbortSignal,
    ): Promise<AnnotationAppearancePicture[]> => {
      const doc = ctx.doc;
      if (!doc) return Promise.resolve([]);
      const { engine } = epochOf(page);
      const kept = drawn.get(page.objectNumber);
      const engines =
        kept && kept.scale === scale && kept.engine === engine
          ? Promise.resolve(kept.pictures)
          : enginePictures(doc, page, scale, signal).then((pictures) => {
              if (!pictures) return [];
              drawn.set(page.objectNumber, { scale, engine, pictures });
              return pictures;
            });
      return Promise.all([engines, placedPictures(page, scale)]).then(([theirs, placed]) => [
        ...theirs,
        ...placed,
      ]);
    },
  };

  /**
   * What a page's pictures depend on, and nothing else. `engine`: which
   * annotations the engine draws on it, each one's appearance version
   * (`apVersion`, which advances when the engine confirms a re-bake) and the
   * state it shows. `placed`: the stamps this session placed that the engine
   * hasn't written yet, which show the preview they were placed with.
   * Position and rotation are absent: the blit translates (`apBox`) and turns
   * (`apRot`) the same pixels, so a move or a spin costs no new picture.
   */
  const epochOf = (page: PageRef): { engine: string; placed: string } => {
    const pageObjectNumber = page.objectNumber;
    const model = pageModel(pageObjectNumber);
    const engine: string[] = [];
    const placed: string[] = [];
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
        if (stamps.lookOf(record)) placed.push(`${id}@placed`);
        continue;
      }
      engine.push(`${id}@${record.apVersion ?? 0}:${record.annotation.appearanceState ?? ''}`);
    }
    return { engine: engine.sort().join('|'), placed: placed.sort().join('|') };
  };

  /**
   * The engine's pictures of each page, kept with the epoch and scale they
   * were drawn at: a placed stamp coming or going asks the engine for nothing.
   */
  const drawn = new Map<
    number,
    { scale: number; engine: string; pictures: AnnotationAppearancePicture[] }
  >();

  /** The engine's pictures of `page` at rest, in the state each shows; `null` when the render failed. */
  const enginePictures = (
    doc: DocumentHandle,
    page: PageRef,
    scale: number,
    signal?: AbortSignal,
  ): Promise<AnnotationAppearancePicture[] | null> => {
    // The look at rest only, in every state: a check box keeps both its
    // pictures, and the looks under the pointer and pressed aren't drawn.
    const task = doc.page(page).annotations.renderAppearances({
      viewport: { kind: 'scale', scale },
      modes: ['normal'],
    });
    if (signal) {
      if (signal.aborted) task.abort(signal.reason);
      else signal.addEventListener('abort', () => task.abort(signal.reason), { once: true });
    }
    return task.then(
      (result) => {
        const model = pageModel(page.objectNumber);
        const annotations = model.order.map((id) => model.byId[id]!.annotation);
        return shownAppearances(result.appearances, annotations);
      },
      () => null,
    );
  };

  /**
   * The pictures of the stamps this session placed on `page` that the engine
   * hasn't written yet: each one's preview, at the size the page shows it,
   * in its box (before its turn, which the layer puts back, as for the
   * engine's).
   */
  const placedPictures = async (
    page: PageRef,
    scale: number,
  ): Promise<AnnotationAppearancePicture[]> => {
    const model = pageModel(page.objectNumber);
    const pictures = model.order.map(async (id) => {
      const record = model.byId[id]!;
      const look = record.unconfirmed ? stamps.lookOf(record) : null;
      const rect = record.apBox;
      if (!look || !rect) return null;
      const preview = await look(rect.width * scale);
      if (!preview) return null;
      return {
        ref: record.annotation.ref,
        mode: 'normal',
        state: null,
        rect,
        image: imageSourceOfBytes(preview.bytes, preview.mimeType ?? 'image/png'),
      } satisfies AnnotationAppearancePicture;
    });
    return (await Promise.all(pictures)).filter(
      (picture): picture is NonNullable<typeof picture> => picture !== null,
    );
  };

  return { api };
}
