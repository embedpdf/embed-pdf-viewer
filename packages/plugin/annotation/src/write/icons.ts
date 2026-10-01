import { PluginError, toPluginError } from '@embedpdf/core';
import { defaultsFor, type Point, type ViewEnv } from '@embedpdf/core-annotation';
import {
  toPageRef,
  type AnnotationDraft,
  type AnnotationRef,
  type AnnotationResources,
  type AttachmentContent,
  type AttachmentFileSource,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { annotationOfTool, iconPlaceAt, iconPlacement, isIconPlaceKind } from './placement';
import type { FilePickerProvider } from '../contract';
import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import { viewEnv } from '../services/geometry';
import { appliedRefOf } from './outcomes';
import type { Stamps } from './stamps';
import type { ResolvedTool } from '../tools/definitions';

/**
 * Icon annotations (sticky notes, file attachments): fixed-size placement at
 * a click, and the one click-to-place entry the place handler forwards every
 * down to.
 */
export function createIcons(
  ctx: Pick<AnnotationContext, 'doc' | 'assertAllowed'>,
  {
    store,
    geometry,
    authority,
    tools,
    filePicker,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'authority' | 'tools' | 'filePicker'>,
  annotations: Pick<AnnotationReads, 'pageOf' | 'get'>,
  stamps: Pick<Stamps, 'placeArmedStamp' | 'requestStampAt'>,
) {
  /** Create an icon annotation and select it (the anchor for its menu and comment popup). */
  const createIcon = (
    pageObjectNumber: number,
    { data, resources }: { data: AnnotationDraft; resources?: AnnotationResources },
  ): Promise<AnnotationRef> => {
    const applied = store.apply([
      { type: 'create', page: toPageRef(pageObjectNumber), draft: data, resources },
    ]);
    store.commit({ type: 'select', ids: [...applied.ids] });
    return appliedRefOf(applied);
  };

  /** Place an icon annotation (note / file attachment) at its usual size,
   *  shown centred on a page point at the view the user sees (`iconPlaceAt`,
   *  the same box the ghost drew) — the icon-kind sibling of the stamp
   *  placement. The engine draws the icon from /C + /Name, filling /Rect. */
  const placeIconAt = (
    tool: ResolvedTool,
    pageObjectNumber: number,
    point: Point,
    view: ViewEnv | undefined,
    file: AttachmentFileSource | null,
  ): boolean => {
    const doc = ctx.doc;
    const page = geometry.sizeOf(pageObjectNumber);
    if (!doc || !page || !isIconPlaceKind(tool.subtype)) return false;
    const { rect } = iconPlaceAt(annotationOfTool(store.model(), tool), point, page, view);
    const placement = iconPlacement(
      tool.subtype,
      { rect },
      defaultsFor(store.model(), tool.preset),
      tool.flags,
      file,
    );
    void createIcon(pageObjectNumber, placement).catch((error) =>
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
  const placeAt = (
    pageObjectNumber: number,
    point: Point,
    displayRotation?: number,
    zoom?: number,
  ): boolean => {
    if (stamps.placeArmedStamp(pageObjectNumber, point, displayRotation)) return true;
    const tool = tools.activeTool();
    if (!tool) return false;
    if (tool.subtype === 'stamp')
      return stamps.requestStampAt(pageObjectNumber, point, displayRotation);
    if (!isIconPlaceKind(tool.subtype)) return false;
    // The view at the click: an attachment lands after its file is picked,
    // where the click showed it.
    const view = viewEnv(zoom, displayRotation);
    if (tool.subtype === 'text') return placeIconAt(tool, pageObjectNumber, point, view, null);
    return filePicker.promptAt(tool, pageObjectNumber, point, (picked) =>
      placeIconAt(tool, pageObjectNumber, point, view, picked),
    );
  };

  const api = {
    placeAt: (page: PageRef, point: Point, displayRotation?: number, zoom?: number) =>
      placeAt(page.objectNumber, point, displayRotation, zoom),
    createAttachment: async (page: PageRef, at: Point, file: AttachmentFileSource) => {
      ctx.assertAllowed('annotations:create', 'annotation.createAttachment');
      authority.assertPage(page);
      const doc = ctx.doc;
      const pageObjectNumber = page.objectNumber;
      const size = geometry.sizeOf(pageObjectNumber);
      const tool = tools.get('attachment');
      if (!doc || !size || !tool || !isIconPlaceKind(tool.subtype)) {
        throw new PluginError('unsupported', 'annotation', 'no attachment tool is registered');
      }
      const { rect } = iconPlaceAt(annotationOfTool(store.model(), tool), at, size, undefined);
      const placement = iconPlacement(
        tool.subtype,
        { rect },
        defaultsFor(store.model(), tool.preset),
        tool.flags,
        file,
      );
      return createIcon(pageObjectNumber, placement).catch((error) => {
        throw toPluginError('annotation', error);
      });
    },
    readAttachment: async (ref: AnnotationRef): Promise<AttachmentContent> => {
      const doc = ctx.doc;
      if (!doc) throw new Error('[annotation] no document bound');
      // The name and MIME type are the annotation's data; the bytes are its `file` resource.
      const dto = annotations.get(ref);
      const file = dto?.subtype === 'file-attachment' ? dto.file : null;
      if (!file) {
        throw new PluginError('not-found', 'annotation', 'the annotation has no attached file');
      }
      const bytes = await doc
        .page(annotations.pageOf(ref))
        .annotations.downloadResource(ref, 'file');
      return { bytes, name: file.name, mimeType: file.mimeType };
    },
    setFilePickerProvider: (provider: FilePickerProvider | null) => filePicker.set(provider),
  };

  return { api };
}
