import { PluginError, toPluginError } from '@embedpdf/core';
import { defaultsFor, fitStampBox, type Rect, type Point } from '@embedpdf/core-annotation';
import {
  annotationKey,
  toPageRef,
  type AnnotationDraft,
  type AnnotationRef,
  type AnnotationResources,
  type AttachmentContent,
  type AttachmentFileSource,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { ICON_PLACE_SIZE, iconPlacement, isIconPlaceKind } from './placement';
import type { FilePickerProvider } from '../contract';
import type { AnnotationReads } from '../read/annotations';
import { boxGeomFields } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';
import { named } from './named';
import type { Stamps } from './stamps';
import { pageSizeOf } from '../services/geometry';
import type { ResolvedTool } from '../tools/definitions';

/**
 * Icon annotations (sticky notes, file attachments): fixed-size placement at
 * a click, and the one click-to-place entry the place handler forwards every
 * down to.
 */
export function createIcons(
  ctx: Pick<AnnotationContext, 'doc'>,
  {
    store,
    geometry,
    authority,
    tools,
    filePicker,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'authority' | 'tools' | 'filePicker'>,
  annotations: Pick<AnnotationReads, 'pageOf' | 'api'>,
  stamps: Pick<Stamps, 'placeArmedStamp' | 'requestStampAt'>,
) {
  /** Create an icon annotation and select it (the anchor for its menu and comment popup). */
  const createIcon = (
    doc: NonNullable<AnnotationContext['doc']>,
    pageObjectNumber: number,
    { data, resources }: { data: AnnotationDraft; resources?: AnnotationResources },
  ): Promise<AnnotationRef> =>
    doc
      .page(toPageRef(pageObjectNumber))
      .annotations.create(named(data), resources)
      .then((result) => {
        store.commit({ type: 'select', ids: [annotationKey(result.created.ref)] });
        return result.created.ref;
      });

  /** Place a fixed-size icon annotation (note / file attachment) centred on a
   *  content point — the icon-kind sibling of the stamp placement. The
   *  engine bakes the 20×20 /AP from /C + /Name. */
  const placeIconAt = (
    tool: ResolvedTool,
    pageObjectNumber: number,
    point: Point,
    rotCW: number,
    file: AttachmentFileSource | null,
  ): boolean => {
    const doc = ctx.doc;
    const crop = geometry.cropOf(pageObjectNumber);
    if (!doc || !crop || !isIconPlaceKind(tool.subtype)) return false;
    const box: Rect = fitStampBox(point, ICON_PLACE_SIZE, pageSizeOf(crop), rotCW);
    const placement = iconPlacement(
      tool.subtype,
      boxGeomFields(box, rotCW, crop),
      defaultsFor(store.model(), tool.preset),
      tool.flags,
      file,
    );
    void createIcon(doc, pageObjectNumber, placement).catch((error) =>
      console.error('[annotation] icon placement failed:', error),
    );
    return true;
  };

  /**
   * The one click-to-place entry the place handler forwards every down to —
   * armed payload first, then the active tool's kind decides:
   *   - stamp        → the source spec (fixed bytes, or the file-picker port)
   *   - note (text)  → place immediately (no payload)
   *   - attachment   → spot first, file second: the file-picker port opens
   *                    inside the click gesture, and placement lands when it
   *                    resolves (dropped on cancel, or if the tool/document
   *                    changed while the picker was open).
   * Returns whether the click was consumed.
   */
  const placeAt = (pageObjectNumber: number, point: Point, displayRotation?: number): boolean => {
    if (stamps.placeArmedStamp(pageObjectNumber, point, displayRotation)) return true;
    const tool = tools.activeTool();
    if (!tool) return false;
    if (tool.subtype === 'stamp')
      return stamps.requestStampAt(pageObjectNumber, point, displayRotation);
    if (!isIconPlaceKind(tool.subtype)) return false;
    const rotCW = tools.uprightRotFor(tool.upright ? displayRotation : undefined);
    if (tool.subtype === 'text') return placeIconAt(tool, pageObjectNumber, point, rotCW, null);
    return filePicker.promptAt(tool, pageObjectNumber, point, (picked) =>
      placeIconAt(tool, pageObjectNumber, point, rotCW, picked),
    );
  };

  const api = {
    placeAt: (page: PageRef, point: Point, displayRotation?: number) =>
      placeAt(page.pageObjectNumber, point, displayRotation),
    createAttachment: async (page: PageRef, at: Point, file: AttachmentFileSource) => {
      authority.assertCreate();
      authority.assertPage(page);
      const doc = ctx.doc;
      const pageObjectNumber = page.pageObjectNumber;
      const crop = geometry.cropOf(pageObjectNumber);
      const tool = tools.get('attachment');
      if (!doc || !crop || !tool || !isIconPlaceKind(tool.subtype)) {
        throw new PluginError('unsupported', 'annotation', 'no attachment tool is registered');
      }
      const box: Rect = fitStampBox(at, ICON_PLACE_SIZE, pageSizeOf(crop), 0);
      const placement = iconPlacement(
        tool.subtype,
        boxGeomFields(box, 0, crop),
        defaultsFor(store.model(), tool.preset),
        tool.flags,
        file,
      );
      return createIcon(doc, pageObjectNumber, placement).catch((error) => {
        throw toPluginError('annotation', error);
      });
    },
    readAttachment: async (ref: AnnotationRef): Promise<AttachmentContent> => {
      const doc = ctx.doc;
      if (!doc) throw new Error('[annotation] no document bound');
      // The name and MIME type are the annotation's data; the bytes are its `file` resource.
      const dto = annotations.api.getRaw(ref);
      const file = dto?.subtype === 'file-attachment' ? dto.file : null;
      if (!file) {
        throw new PluginError('not-found', 'annotation', 'the annotation has no attached file');
      }
      const bytes = await doc.page(annotations.pageOf(ref)).annotations.readResource(ref, 'file');
      return { bytes, name: file.name, ...(file.mimeType ? { mimeType: file.mimeType } : {}) };
    },
    setFilePickerProvider: (provider: FilePickerProvider | null) => filePicker.set(provider),
  };

  return { api };
}
