import { fitStampBox, type Rect, type Point } from '@embedpdf/core-annotation';
import {
  annotationKey,
  resolveBinarySource,
  sniffBinaryMetadata,
  toPageRef,
  type AnnotationRef,
  type BinarySource,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import {
  type ArmedStampPreview,
  type StampPlacement,
  type StampPreviewProvider,
  type StampToolInput,
} from '../contract';
import type { ArmedStampInfo } from '../contract';
import { previewBucket } from '../host-contract';
import { setToolGhost } from '../model';
import { boxGeomFields } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';
import { pageSizeOf } from '../services/geometry';
import { ARMED_STAMP_TOOL_ID } from '../tools/definitions';

/**
 * The armed stamp-tool payload: the bytes the next click places, plus the
 * PDF-point placement size (derived from the sniffed intrinsic aspect).
 * Transient tool state — deliberately not in the model: it is never
 * rendered, never synced, and dies with the tool. `preview` is the
 * browser-paintable render for the hover ghost.
 */
interface ArmedStamp {
  source: BinarySource;
  /** The desired placement size (PDF points, pre page-clamp). */
  width: number;
  height: number;
  /** Resolution-aware ghost source; null = no ghost. */
  preview: StampPreviewProvider | null;
  /** One render per bucket for this arm; dropped on disarm/re-arm. */
  previewCache: Map<number, Promise<ArmedStampPreview | null>>;
  name?: string;
  subject?: string;
}

/** Fixed bytes as a provider: the same image at every size. */
const fixedPreview = (bytes: Uint8Array, mimeType?: string): StampPreviewProvider => {
  const preview: ArmedStampPreview = { bytes, ...(mimeType ? { mimeType } : {}) };
  return async () => preview;
};

/**
 * The desired stamp size (PDF points) from sniffed bytes: the image's
 * Intrinsic pixel dimensions taken 1:1 as points (keep the
 * artwork's own size, then clamp to the page at placement). A `targetWidth`
 * override scales to that width, aspect preserved. Vector (PDF) stamps carry
 * no sniffable dimensions — a caller-supplied `intrinsic` override (a stamp
 * library knows its page size) keeps the true aspect; without one they fall
 * back to a square target.
 */
const desiredStampSize = (
  meta: NonNullable<ReturnType<typeof sniffBinaryMetadata>>,
  targetWidth?: number,
  intrinsicOverride?: { width: number; height: number },
): { width: number; height: number } => {
  const intrinsic =
    intrinsicOverride && intrinsicOverride.width > 0 && intrinsicOverride.height > 0
      ? intrinsicOverride
      : 'width' in meta && meta.width > 0
        ? { width: meta.width, height: meta.height }
        : { width: targetWidth ?? 150, height: targetWidth ?? 150 };
  if (targetWidth === undefined) return intrinsic;
  return { width: targetWidth, height: targetWidth * (intrinsic.height / intrinsic.width) };
};

/**
 * Stamps: arming a payload for the next click, and the one engine write
 * both the armed and the click-to-place paths funnel through.
 */
export function createStamps(
  ctx: Pick<AnnotationContext, 'doc' | 'state' | 'notify' | 'tryGet'>,
  {
    store,
    geometry,
    records,
    tools,
    filePicker,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'records' | 'tools' | 'filePicker'>,
) {
  let armed: ArmedStamp | null = null;
  /** The public face of the armed payload: a new object on every arm, null when disarmed. */
  let armedInfo: ArmedStampInfo | null = null;
  /** A new or dropped payload invalidates the ghost drawn for the old one, and wakes readers. */
  const armChanged = (): void => {
    ctx.state.update(setToolGhost, null);
    ctx.notify();
  };

  const armStamp = async (input: StampToolInput): Promise<void> => {
    // Resolve + sniff up front: a bad payload fails here (at the button),
    // not at the click. The original `source` is kept for the create call —
    // normalization inside the engine handles it again from scratch.
    const resolved = await resolveBinarySource(input.source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) {
      throw new Error('[annotation] stamp source must be PNG, JPEG, or single-page PDF bytes');
    }
    // Ghost preview: an explicit `preview` wins (the only way for PDF sources —
    // browsers can't paint those); a provider renders per size bucket; raster
    // sources default to their own bytes.
    let preview: StampPreviewProvider | null = null;
    if (typeof input.preview === 'function') {
      preview = input.preview;
    } else if (input.preview) {
      const resolvedPreview = await resolveBinarySource(input.preview);
      preview = fixedPreview(new Uint8Array(resolvedPreview.bytes), resolvedPreview.mimeType);
    } else if (meta.mimeType !== 'application/pdf') {
      preview = fixedPreview(new Uint8Array(resolved.bytes), meta.mimeType);
    }
    armed = {
      source: input.source,
      ...desiredStampSize(meta, input.targetWidth, input.intrinsicSize),
      preview,
      previewCache: new Map(),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
    };
    armedInfo = {
      width: armed.width,
      height: armed.height,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
    };
    armChanged();
    ctx.tryGet(InteractionToken)?.activateTool(ARMED_STAMP_TOOL_ID);
  };

  const disarmStamp = (): void => {
    if (!armed) return;
    armed = null;
    armedInfo = null;
    armChanged();
  };

  /** Place a stamp of `desired` PDF-point size centred on a content point — the
   *  one engine-write both the armed and click-to-place paths funnel through.
   *  The size is fit to the page and clamped fully onto it (the rubber-stamp
   *  rule: never larger than the page, aspect preserved), and never spills off
   *  the edge. `rotCW` (the tool's upright counter-rotation, CW content degrees)
   *  emits the repository's box rotation fields — the engine bakes the tilted
   *  /AP exactly as an interactively rotated stamp round-trips, and the fit uses
   *  the rotated footprint. Returns null when the page/document isn't ready. */
  const createStampAt = (
    pageObjectNumber: number,
    point: Point,
    source: BinarySource,
    desired: { width: number; height: number },
    rotCW = 0,
    identity: { name?: string; subject?: string } = {},
  ): Promise<AnnotationRef> | null => {
    const doc = ctx.doc;
    const crop = geometry.cropOf(pageObjectNumber);
    if (!doc || !crop) return null;
    const box: Rect = fitStampBox(point, desired, pageSizeOf(crop), rotCW);
    return doc
      .page(toPageRef(pageObjectNumber))
      .annotations.create({
        subtype: 'stamp',
        ...boxGeomFields(box, rotCW, crop),
        source,
        fit: 'contain',
        ...(identity.name !== undefined ? { name: identity.name } : {}),
        ...(identity.subject !== undefined ? { subject: identity.subject } : {}),
      })
      .then((result) => {
        // The fold has added the confirmed stamp; every placement selects
        // its result (the anchor for menus and editing).
        store.commit({ type: 'select', ids: [annotationKey(result.created.ref)] });
        return result.created.ref;
      });
  };

  /** The click path's fire-and-forget wrapper: a rejected placement is logged,
   *  never thrown into the gesture. */
  const stageStampAt = (
    pageObjectNumber: number,
    point: Point,
    source: BinarySource,
    desired: { width: number; height: number },
    rotCW = 0,
    identity: { name?: string; subject?: string } = {},
  ): boolean => {
    const placed = createStampAt(pageObjectNumber, point, source, desired, rotCW, identity);
    if (!placed) return false;
    placed.catch((error) => console.error('[annotation] stamp placement failed:', error));
    return true;
  };

  /** Programmatic placement — the same law as a click, awaited. */
  const placeStamp = async (
    input: StampToolInput,
    placement: StampPlacement,
  ): Promise<AnnotationRef> => {
    const resolved = await resolveBinarySource(input.source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) {
      throw new Error('[annotation] stamp source must be PNG, JPEG, or single-page PDF bytes');
    }
    const placed = createStampAt(
      placement.page.pageObjectNumber,
      placement.at,
      input.source,
      desiredStampSize(meta, placement.targetWidth ?? input.targetWidth, input.intrinsicSize),
      placement.rotation ?? 0,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
      },
    );
    if (!placed) {
      throw new Error(
        `[annotation] cannot place a stamp on page ${placement.page.pageObjectNumber}: document or page not ready`,
      );
    }
    return placed;
  };

  const placeArmedStamp = (
    pageObjectNumber: number,
    point: Point,
    displayRotation?: number,
  ): boolean => {
    const payload = armed;
    if (!payload) return false;
    return stageStampAt(
      pageObjectNumber,
      point,
      payload.source,
      { width: payload.width, height: payload.height },
      tools.uprightRotFor(displayRotation),
      {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.subject !== undefined ? { subject: payload.subject } : {}),
      },
    );
  };

  /** Sniff a stamp source (rejecting non-image bytes) and place it at its
   *  intrinsic size (fit to the page in {@link createStampAt}); `targetWidth`
   *  overrides the width, aspect preserved. */
  const placeStampSource = async (
    pageObjectNumber: number,
    point: Point,
    source: BinarySource,
    rotCW: number,
    targetWidth?: number,
  ): Promise<void> => {
    const resolved = await resolveBinarySource(source);
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) {
      console.error('[annotation] stamp source must be PNG, JPEG, or single-page PDF bytes');
      return;
    }
    stageStampAt(pageObjectNumber, point, source, desiredStampSize(meta, targetWidth), rotCW);
  };

  /**
   * Click-to-place: resolve the active tool's source spec. Fixed `bytes` place
   * immediately; a `'prompt'` source asks the installed provider, then places on
   * resolve — dropping the placement if it was cancelled, or if the tool or
   * document changed while the picker was open (the intent expired).
   */
  const requestStampAt = (
    pageObjectNumber: number,
    point: Point,
    displayRotation?: number,
  ): boolean => {
    const tool = tools.activeTool();
    const spec = tool?.source;
    if (!spec) return false;
    // Resolved at the click (like the placement point): the upright intent
    // belongs to the moment the author picked the spot, even when a 'prompt'
    // source resolves the bytes later.
    const rotCW = tools.uprightRotFor(tool.upright ? displayRotation : undefined);
    if (spec.kind === 'bytes') {
      void placeStampSource(pageObjectNumber, point, spec.source, rotCW);
      return true;
    }
    // kind === 'prompt' — needs the environment: the one file-picker port.
    return filePicker.promptAt(
      tool,
      pageObjectNumber,
      point,
      (picked) => void placeStampSource(pageObjectNumber, point, picked.data, rotCW),
    );
  };

  const api = {
    armStamp,
    disarmStamp,
    placeStamp,
    hasArmedStamp: () => armed != null,
    placeArmedStamp: (page: PageRef, point: Point, displayRotation?: number) =>
      placeArmedStamp(page.pageObjectNumber, point, displayRotation),
    requestStampAt: (page: PageRef, point: Point, displayRotation?: number) =>
      requestStampAt(page.pageObjectNumber, point, displayRotation),
    getArmedStamp: () => armedInfo,
    renderArmedStampPreview: (devicePixelWidth?: number) => {
      const payload = armed;
      if (!payload?.preview) return Promise.resolve(null);
      const bucket = previewBucket(devicePixelWidth ?? 0);
      let pending = payload.previewCache.get(bucket);
      if (!pending) {
        pending = payload.preview(bucket).catch((error) => {
          console.error('[annotation] stamp ghost preview failed:', error);
          return null;
        });
        payload.previewCache.set(bucket, pending);
      }
      return pending;
    },
  };

  return { armed: () => armed, placeArmedStamp, requestStampAt, api };
}

export type Stamps = ReturnType<typeof createStamps>;
