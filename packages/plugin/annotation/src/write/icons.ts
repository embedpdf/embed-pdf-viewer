import { defaultsFor, type Point, type ViewEnv } from '@embedpdf/core-annotation';
import {
  toPageRef,
  type AnnotationDraft,
  type AnnotationResources,
  type AttachmentFileSource,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { annotationOfTool, iconPlaceAt, iconPlacement, isIconPlaceKind } from './placement';
import type { FilePickerProvider } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';
import { viewEnv } from '../services/geometry';
import { appliedOrThrow } from './outcomes';
import type { Stamps } from './stamps';
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
    tools,
    filePicker,
    afterCreate,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'tools' | 'filePicker' | 'afterCreate'>,
  stamps: Pick<Stamps, 'placeArmedStamp' | 'requestStampAt'>,
) {
  /**
   * Create an icon annotation with a tool's click: its `afterCreate` says
   * whether it is selected (the anchor for its menu and comment popup).
   */
  const createIcon = (
    tool: ResolvedTool,
    pageObjectNumber: number,
    { data, resources }: { data: AnnotationDraft; resources?: AnnotationResources },
  ): Promise<unknown> =>
    store
      .applyWhenNumbered([
        { type: 'create', page: toPageRef(pageObjectNumber), draft: data, resources },
      ])
      .then((applied) => {
        afterCreate.placed(tool.id, applied.ids);
        return appliedOrThrow(applied);
      });

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
    void createIcon(tool, pageObjectNumber, placement).catch((error) =>
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
    setFilePickerProvider: (provider: FilePickerProvider | null) => filePicker.set(provider),
  };

  return { api };
}
