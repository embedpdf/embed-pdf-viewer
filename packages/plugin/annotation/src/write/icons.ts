import { PluginError, toPluginError } from '@embedpdf/core';
import { defaultsFor, fitStampBox, type Rect, type Vec } from '@embedpdf/core-annotation';
import {
  annotationKey,
  toPageRef,
  type AnnotationDraft,
  type AnnotationRef,
  type AttachmentFileSource,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { ICON_PLACE_SIZE, iconPlacementDraft, isIconPlaceKind } from './placement';
import type { FilePickerProvider } from '../contract';
import { boxGeomFields } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { Stamps } from './stamps';
import type { Announcer } from '../services/announce';
import { ORIGIN_API } from '../services/events';
import { pageSizeOf } from '../services/geometry';
import type { ResolvedTool } from '../tools/definitions';

/**
 * Icon annotations (sticky notes, file attachments): fixed-size placement at
 * a click, and the ONE click-to-place entry the place handler forwards every
 * down to.
 */
export function createIcons(
  ctx: Pick<AnnotationContext, 'doc'>,
  {
    store,
    geometry,
    records,
    authority,
    tools,
    filePicker,
  }: Pick<
    AnnotationServices,
    'store' | 'geometry' | 'records' | 'authority' | 'tools' | 'filePicker'
  >,
  announce: Announcer,
  stamps: Pick<Stamps, 'placeArmedStamp' | 'requestStampAt'>,
) {
  /** Engine create + model sync for an icon draft; selects the result (the
   *  anchor for its menu / future comment popup). */
  const createIcon = (
    doc: NonNullable<AnnotationContext['doc']>,
    pon: number,
    draft: AnnotationDraft,
  ): Promise<AnnotationRef> =>
    doc
      .page(toPageRef(pon))
      .annotations.create(draft)
      .then((res) => {
        records.sync(res.created, 'baked');
        store.commit({ t: 'select', ids: [annotationKey(res.created.ref)] });
        announce.created(res.created, ORIGIN_API);
        return res.created.ref;
      });

  /** Place a fixed-size ICON annotation (note / file attachment) centred on a
   *  content point — the icon-kind sibling of the stamp placement. The
   *  engine bakes the 20×20 /AP from /C + /Name. */
  const placeIconAt = (
    tool: ResolvedTool,
    pon: number,
    point: Vec,
    rotCW: number,
    file: AttachmentFileSource | null,
  ): boolean => {
    const doc = ctx.doc;
    const crop = geometry.cropOf(pon);
    if (!doc || !crop || !isIconPlaceKind(tool.subtype)) return false;
    const box: Rect = fitStampBox(point, ICON_PLACE_SIZE, pageSizeOf(crop), rotCW);
    const draft = iconPlacementDraft(
      tool.subtype,
      boxGeomFields(box, rotCW, crop),
      defaultsFor(store.model(), tool.preset),
      tool.flags,
      file,
    );
    void createIcon(doc, pon, draft).catch((err) =>
      console.error('[annotation] icon placement failed:', err),
    );
    return true;
  };

  /**
   * The ONE click-to-place entry the place handler forwards every down to —
   * armed payload first, then the active tool's kind decides:
   *   - stamp        → the source spec (fixed bytes, or the file-picker port)
   *   - note (text)  → place immediately (no payload)
   *   - attachment   → spot first, file second: the file-picker port opens
   *                    inside the click gesture, and placement lands when it
   *                    resolves (dropped on cancel, or if the tool/document
   *                    changed while the picker was open).
   * Returns whether the click was consumed.
   */
  const placeAt = (pon: number, point: Vec, displayRotation?: number): boolean => {
    if (stamps.placeArmedStamp(pon, point, displayRotation)) return true;
    const tool = tools.activeTool();
    if (!tool) return false;
    if (tool.subtype === 'stamp') return stamps.requestStampAt(pon, point, displayRotation);
    if (!isIconPlaceKind(tool.subtype)) return false;
    const rotCW = tools.uprightRotFor(tool.upright ? displayRotation : undefined);
    if (tool.subtype === 'text') return placeIconAt(tool, pon, point, rotCW, null);
    return filePicker.promptAt(tool, pon, point, (picked) =>
      placeIconAt(tool, pon, point, rotCW, picked),
    );
  };

  const api = {
    placeAt: (page: PageRef, point: Vec, displayRotation?: number) =>
      placeAt(page.pageObjectNumber, point, displayRotation),
    createAttachment: async (page: PageRef, at: Vec, file: AttachmentFileSource) => {
      authority.assertCreate();
      authority.assertPage(page);
      const doc = ctx.doc;
      const pon = page.pageObjectNumber;
      const crop = geometry.cropOf(pon);
      const tool = tools.get('attachment');
      if (!doc || !crop || !tool || !isIconPlaceKind(tool.subtype)) {
        throw new PluginError('unsupported', 'annotation', 'no attachment tool is registered');
      }
      const box: Rect = fitStampBox(at, ICON_PLACE_SIZE, pageSizeOf(crop), 0);
      const draft = iconPlacementDraft(
        tool.subtype,
        boxGeomFields(box, 0, crop),
        defaultsFor(store.model(), tool.preset),
        tool.flags,
        file,
      );
      return createIcon(doc, pon, draft).catch((error) => {
        throw toPluginError('annotation', error);
      });
    },
    readAttachment: async (ref: AnnotationRef) => {
      const doc = ctx.doc;
      if (!doc) throw new Error('[annotation] no document bound');
      const pon = records.pageOf(ref);
      if (pon == null) throw new Error('[annotation] cannot resolve page for ref');
      const annotations = doc.page(toPageRef(pon)).annotations;
      if (!annotations.downloadFile) {
        throw new Error('[annotation] this engine does not support attachment download');
      }
      return annotations.downloadFile(ref);
    },
    setFilePickerProvider: (provider: FilePickerProvider | null) => filePicker.set(provider),
  };

  return { api };
}
