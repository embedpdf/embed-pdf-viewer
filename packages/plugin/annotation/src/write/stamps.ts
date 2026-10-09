import { PluginError, type OperationOptions } from '@embedpdf/core';
import {
  fitStampBox,
  type Id,
  type ModelAnnotation,
  type Rect,
  type Point,
} from '@embedpdf/core-annotation';
import {
  resolveBinarySource,
  sniffBinaryMetadata,
  toPageRef,
  type Annotation,
  type BinarySource,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import {
  type ArmedStampPreview,
  type StampInput,
  type StampPlacement,
  type StampPreviewProvider,
} from '../contract';
import type { ArmedStampInfo } from '../contract';
import { previewBucket } from '../host-contract';
import { setGhostAt } from '../model';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { Applied } from '../services/store';
import { appliedAnnotationOf } from './outcomes';
import { ARMED_STAMP_TOOL_ID } from '../tools/definitions';

/** Bytes that aren't a picture a stamp can show. */
const notAPicture = (): PluginError =>
  new PluginError(
    'invalid-input',
    'annotation',
    'a stamp must be PNG, JPEG, or one-page PDF bytes',
  );

/**
 * The armed stamp-tool payload: the bytes the next click places, plus the
 * PDF-point placement size (derived from the sniffed intrinsic aspect).
 * Transient tool state — deliberately not in the model: it is never
 * rendered, never synced, and dies with the tool. `preview` is the
 * browser-paintable render for the hover ghost, and the look of each stamp
 * it places until the engine's picture of it exists.
 */
interface ArmedStamp {
  source: BinarySource;
  /** The desired placement size (PDF points, pre page-clamp). */
  width: number;
  height: number;
  /** Resolution-aware ghost source, one render per bucket for this arm; null = no ghost. */
  preview: StampPreviewProvider | null;
  name?: string;
  subject?: string;
}

/** The bytes of a stamp source; its declared type and name don't matter, the engine sniffs. */
const bytesOf = (source: BinarySource): Uint8Array | Blob =>
  source instanceof Uint8Array || !('data' in source) ? source : source.data;

/** Fixed bytes as a provider: the same image at every size. */
const fixedPreview = (bytes: Uint8Array, mimeType?: string): StampPreviewProvider => {
  const preview: ArmedStampPreview = { bytes, ...(mimeType ? { mimeType } : {}) };
  return async () => preview;
};

/**
 * `provider`, asked once per size bucket (`previewBucket`): a zoom asks for
 * no new render inside a bucket. A render that fails is logged, and is none.
 */
const cachedPreview = (provider: StampPreviewProvider): StampPreviewProvider => {
  const renders = new Map<number, Promise<ArmedStampPreview | null>>();
  return (devicePixelWidth) => {
    const bucket = previewBucket(devicePixelWidth);
    let render = renders.get(bucket);
    if (!render) {
      render = provider(bucket).catch((error) => {
        console.error('[annotation] stamp preview failed:', error);
        return null;
      });
      renders.set(bucket, render);
    }
    return render;
  };
};

/**
 * What a stamp source looks like on this device, before the engine draws
 * it: an explicit `preview` (the only way for PDF sources: browsers can't
 * paint those), else a raster source's own bytes. `null`: no look.
 */
async function previewOf(
  input: Pick<StampInput, 'preview'>,
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<StampPreviewProvider | null> {
  if (typeof input.preview === 'function') return cachedPreview(input.preview);
  if (input.preview) {
    const resolved = await resolveBinarySource(input.preview);
    return fixedPreview(new Uint8Array(resolved.bytes), resolved.mimeType);
  }
  return mimeType === 'application/pdf' ? null : fixedPreview(new Uint8Array(bytes), mimeType);
}

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
  ctx: Pick<
    AnnotationContext,
    'doc' | 'state' | 'notify' | 'tryGet' | 'pageOf' | 'assertAllowed' | 'cancellable'
  >,
  {
    store,
    geometry,
    tools,
    filePicker,
    afterCreate,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'tools' | 'filePicker' | 'afterCreate'>,
) {
  let armed: ArmedStamp | null = null;
  /**
   * The look of each stamp this session placed whose create the engine
   * hasn't answered: the preview it was placed with. The engine's picture
   * replaces it (read/render.ts).
   */
  const looks = new Map<Id, StampPreviewProvider>();

  /** What a stamp looks like before the engine's picture of it exists; `null` once it does. */
  const lookOf = (record: ModelAnnotation): StampPreviewProvider | null => {
    if (record.unconfirmed) return looks.get(record.id) ?? null;
    looks.delete(record.id);
    return null;
  };
  /** The public face of the armed payload: a new object on every arm, null when disarmed. */
  let armedInfo: ArmedStampInfo | null = null;
  /** A new or dropped payload invalidates the ghost drawn for the old one, and wakes readers. */
  const armChanged = (): void => {
    ctx.state.update(setGhostAt, null);
    ctx.notify();
  };

  const armStamp = async (input: StampInput, options: OperationOptions = {}): Promise<void> => {
    // Resolve + sniff up front: a bad payload fails here (at the button),
    // not at the click. The original `source` is kept for the create call:
    // the engine normalizes it again from scratch.
    const resolved = await ctx.cancellable(options.signal, resolveBinarySource(input.source));
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) throw notAPicture();
    const preview = await previewOf(input, resolved.bytes, meta.mimeType);
    armed = {
      source: input.source,
      ...desiredStampSize(meta, input.targetWidth, input.intrinsicSize),
      preview,
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

  /** Place a stamp of `desired` PDF-point size centred on a page point — the
   *  one engine-write both the armed and click-to-place paths funnel through.
   *  The size is fit to the page and clamped fully onto it (the rubber-stamp
   *  rule: never larger than the page, aspect preserved), and never spills off
   *  the edge. `rotCW` (the tool's upright counter-rotation, CW content degrees)
   *  becomes the box's `rotation` — the engine bakes the tilted
   *  /AP exactly as an interactively rotated stamp round-trips, and the fit uses
   *  the rotated footprint. Shown at once, unless the document is out of
   *  object numbers for a moment. Returns null when the page/document isn't ready. */
  const createStampAt = (
    pageObjectNumber: number,
    point: Point,
    source: BinarySource,
    desired: { width: number; height: number },
    look: StampPreviewProvider | null,
    rotCW = 0,
    identity: { name?: string; subject?: string } = {},
    select = false,
  ): Promise<Applied> | null => {
    const doc = ctx.doc;
    const page = geometry.sizeOf(pageObjectNumber);
    if (!doc || !page) return null;
    const box: Rect = fitStampBox(point, desired, page, rotCW);
    const placed = store.applyWhenNumbered(
      [
        {
          type: 'create',
          page: toPageRef(pageObjectNumber),
          draft: {
            subtype: 'stamp',
            // Its box before any turn, and the turn (`null` upright, so none is kept).
            box,
            rotation: rotCW || null,
            fit: 'contain',
            ...(identity.name !== undefined ? { name: identity.name } : {}),
            ...(identity.subject !== undefined ? { subject: identity.subject } : {}),
          },
          resources: { appearance: bytesOf(source) },
        },
      ],
      { select },
    );
    // It shows its drawing at once: the preview it was placed with.
    if (look) {
      void placed.then(({ ids: [id] }) => {
        if (id === undefined) return;
        looks.set(id, look);
        ctx.notify();
      });
    }
    return placed;
  };

  /**
   * The click path's fire-and-forget wrapper: the tool's `afterCreate` says
   * whether the stamp is selected; a rejected placement is logged, never
   * thrown into the gesture.
   */
  const stageStampAt = (
    pageObjectNumber: number,
    point: Point,
    source: BinarySource,
    desired: { width: number; height: number },
    look: StampPreviewProvider | null,
    rotCW = 0,
    identity: { name?: string; subject?: string } = {},
  ): boolean => {
    const placed = createStampAt(pageObjectNumber, point, source, desired, look, rotCW, identity);
    if (!placed) return false;
    const toolId = tools.activeTool()?.id;
    placed
      .then((applied) => {
        afterCreate.placed(toolId, applied.ids as Id[]);
        return appliedAnnotationOf(applied);
      })
      .catch((error) => console.error('[annotation] stamp placement failed:', error));
    return true;
  };

  /** Placement from code: the same law as a click, awaited; selected only when asked. */
  const placeStamp = async (
    input: StampInput,
    placement: StampPlacement,
    options: OperationOptions = {},
  ): Promise<{ annotation: Annotation }> => {
    ctx.assertAllowed('annotations:create', 'annotation.stamps.place');
    const { ref: page } = ctx.pageOf(placement.page);
    const resolved = await ctx.cancellable(options.signal, resolveBinarySource(input.source));
    const meta = sniffBinaryMetadata(resolved.bytes);
    if (!meta) throw notAPicture();
    const look = await ctx.cancellable(
      options.signal,
      previewOf(input, resolved.bytes, meta.mimeType),
    );
    const placed = createStampAt(
      page.objectNumber,
      placement.center,
      input.source,
      desiredStampSize(meta, placement.targetWidth ?? input.targetWidth, input.intrinsicSize),
      look,
      placement.rotation ?? 0,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
      },
      placement.select ?? false,
    );
    if (!placed) {
      throw new PluginError(
        'not-ready',
        'annotation',
        `page ${page.objectNumber} isn't laid out yet`,
      );
    }
    const annotation = await ctx.cancellable(
      options.signal,
      placed.then((applied) => appliedAnnotationOf(applied)),
    );
    if (!annotation) {
      throw new PluginError('operation-failed', 'annotation', 'the stamp could not be placed');
    }
    return { annotation };
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
      payload.preview,
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
      console.error('[annotation]', notAPicture().message);
      return;
    }
    const look = await previewOf({}, resolved.bytes, meta.mimeType);
    stageStampAt(pageObjectNumber, point, source, desiredStampSize(meta, targetWidth), look, rotCW);
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
      (picked) =>
        void placeStampSource(
          pageObjectNumber,
          point,
          picked.data instanceof ArrayBuffer ? new Uint8Array(picked.data) : picked.data,
          rotCW,
        ),
    );
  };

  /** The `stamps` noun. */
  const stamps = {
    arm: armStamp,
    disarm: disarmStamp,
    isArmed: () => armed != null,
    place: placeStamp,
  };

  const api = {
    placeArmedStamp: (page: PageRef, point: Point, displayRotation?: number) =>
      placeArmedStamp(page.objectNumber, point, displayRotation),
    requestStampAt: (page: PageRef, point: Point, displayRotation?: number) =>
      requestStampAt(page.objectNumber, point, displayRotation),
    getArmedStamp: () => armedInfo,
    renderArmedStampPreview: (devicePixelWidth?: number) =>
      armed?.preview?.(devicePixelWidth ?? 0) ?? Promise.resolve(null),
  };

  return { armed: () => armed, lookOf, placeArmedStamp, requestStampAt, stamps, api };
}

export type Stamps = ReturnType<typeof createStamps>;
