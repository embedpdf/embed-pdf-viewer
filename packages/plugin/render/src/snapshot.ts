/**
 * The snapshot tool: drag a box on a page, or click for the whole page, and
 * the box becomes the snapshot, part of the page as a picture to copy or
 * save. The box is state, in page space on the page the press was on; its
 * picture is a one-off render of it (`renderPage` with a `rect`), kept beside
 * the state, since a promise is no data. The pointer comes from the
 * interaction hub when there is one: `connect` registers the tool and its
 * handler.
 */
import {
  memo,
  type DocCapability,
  type EngineRenderPolicy,
  type PageRef,
  type PluginContext,
} from '@embedpdf/core';
import { rectFromCorners, type Rotation, type Point, type Rect } from '@embedpdf/core-geometry';
import {
  InteractionToken,
  samplePointOn,
  type InteractionHandler,
} from '@embedpdf/plugin-interaction/contract/host';

import {
  SNAPSHOT_MAX_PIXELS,
  SNAPSHOT_TOOL,
  type RenderCapability,
  type RenderSettings,
  type Snapshot,
  type SnapshotChangedEvent,
  type SnapshotSettings,
} from './contract';
import type { RenderHostCapability } from './host-contract';
import { setSnapshotBox, type RenderState, type SnapshotBox } from './model';

const RENDER_SCOPE: DocCapability = 'doc.render';
const CONTENT_COPY_SCOPE: DocCapability = 'doc.content.copy';

/** The behavior tag the snapshot tool turns on, which its handler answers to. */
const SNAPSHOT_BOX_TAG = 'snapshot-box';

/** A drag shorter than this on both axes, in view px, is a click (the zoom tool's threshold). */
const BOX_THRESHOLD_PX = 4;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Whether a drag is big enough on screen to be a box, not a click. */
const isBox = (box: SnapshotBox): boolean =>
  Math.abs(box.to.x - box.from.x) * box.scale >= BOX_THRESHOLD_PX ||
  Math.abs(box.to.y - box.from.y) * box.scale >= BOX_THRESHOLD_PX;

/** The rect a box spans; a side dragged flat is one view pixel, so there's a picture to take. */
function rectOf(box: SnapshotBox): Rect {
  const rect = rectFromCorners(box.from, box.to);
  const least = 1 / box.scale;
  return {
    ...rect,
    width: Math.max(rect.width, least),
    height: Math.max(rect.height, least),
  };
}

/**
 * The scale of a snapshot's picture: the setting, lowered until the picture
 * fits {@link SNAPSHOT_MAX_PIXELS} and the deployment's budget, counting its
 * sides in whole pixels.
 */
export function snapshotScale(rect: Rect, wanted: number, policy: EngineRenderPolicy): number {
  const deployment = policy.kind === 'lattice' ? (policy.maxRenderPixels ?? Infinity) : Infinity;
  const budget = Math.min(SNAPSHOT_MAX_PIXELS, deployment);
  const pixelsAt = (scale: number) =>
    Math.ceil(rect.width * scale) * Math.ceil(rect.height * scale);
  let scale = Math.min(wanted, Math.sqrt(budget / (rect.width * rect.height)));
  while (pixelsAt(scale) > budget) scale *= 0.999;
  return scale;
}

export function createSnapshots(
  ctx: PluginContext<RenderState, RenderSettings>,
  {
    renderPage,
    renderPolicy,
    settings,
  }: {
    renderPage: RenderCapability['renderPage'];
    renderPolicy: () => EngineRenderPolicy;
    settings: () => SnapshotSettings;
  },
) {
  const changed = ctx.events.source<SnapshotChangedEvent>();
  const box = (): SnapshotBox | null => ctx.state.get().snapshot;
  const canSnapshot = (): boolean => ctx.allows(RENDER_SCOPE) && ctx.allows(CONTENT_COPY_SCOPE);

  // The snapshot held now, and the way to stop its picture: set before the
  // box turns held, so a reader woken by the state finds it.
  let held: Snapshot | null = null;
  let stopPicture: AbortController | null = null;

  function clearSnapshot(): void {
    stopPicture?.abort();
    stopPicture = null;
    const letGo = held;
    held = null;
    ctx.state.update(setSnapshotBox, null);
    if (letGo) changed.emit({ snapshot: null });
  }

  /** Hold `rect` of the box's page as the snapshot, and render its picture. */
  function take(dragged: SnapshotBox, rect: Rect): void {
    const stop = new AbortController();
    stopPicture = stop;
    const scale = snapshotScale(rect, settings().scale, renderPolicy());
    // Every change made before the snapshot is in its picture, a stamp placed
    // a moment ago too: the engine has them all first.
    const image = ctx.cancellable(stop.signal, ctx.changes.whenSettled()).then(() =>
      renderPage(dragged.page, {
        rect,
        scale,
        rotation: dragged.rotation,
        format: 'png',
        signal: stop.signal,
      }),
    );
    image.catch(() => {}); // nobody may ever ask for it
    held = { page: dragged.page, rect, image };
    ctx.state.update(setSnapshotBox, {
      ...dragged,
      from: { x: rect.x, y: rect.y },
      to: { x: rect.x + rect.width, y: rect.y + rect.height },
      held: true,
    });
    changed.emit({ snapshot: held });
  }

  // ── the gesture, in page space on the page the press was on ──

  function begin(page: PageRef, point: Point, scale: number, rotation: Rotation): boolean {
    if (!canSnapshot() || !ctx.getPage(page)) return false;
    clearSnapshot();
    ctx.state.update(setSnapshotBox, {
      page,
      from: point,
      to: point,
      scale,
      rotation,
      held: false,
    });
    return true;
  }

  function move(point: Point): void {
    const dragged = box();
    const size = dragged && !dragged.held ? ctx.getPage(dragged.page)?.size : undefined;
    if (!dragged || !size) return;
    const to = { x: clamp(point.x, 0, size.width), y: clamp(point.y, 0, size.height) };
    ctx.state.update(setSnapshotBox, { ...dragged, to });
  }

  function end(): void {
    const dragged = box();
    if (!dragged || dragged.held) return;
    const size = ctx.getPage(dragged.page)?.size;
    if (!size) {
      ctx.state.update(setSnapshotBox, null);
      return;
    }
    // A click takes the whole page.
    take(dragged, isBox(dragged) ? rectOf(dragged) : { x: 0, y: 0, ...size });
  }

  function cancel(): void {
    const dragged = box();
    if (dragged && !dragged.held) ctx.state.update(setSnapshotBox, null);
  }

  const handler: InteractionHandler = {
    id: 'render-snapshot',
    priority: 10,
    enabledFor: (tool) => tool.enables.has(SNAPSHOT_BOX_TAG),
    // A press between pages does nothing: a box lives on one page.
    onPointerDown: (sample) =>
      sample.page
        ? begin(
            sample.page.ref,
            sample.page.point,
            sample.page.scale ?? 1,
            sample.page.rotation ?? 0,
          )
        : false,
    onPointerMove: (sample) => {
      const dragged = box();
      const point = dragged && samplePointOn(sample, dragged.page);
      if (point) move(point);
    },
    onPointerUp: (sample) => {
      const dragged = box();
      const point = dragged && samplePointOn(sample, dragged.page);
      if (point) move(point);
      end();
    },
    onPointerCancel: cancel,
  };

  // The box as a page layer draws it: the same object while the box is the same.
  const shown = memo(
    () => [box()] as const,
    (current): { page: PageRef; rect: Rect } | null =>
      current && (current.held || isBox(current))
        ? { page: current.page, rect: rectOf(current) }
        : null,
  );

  return {
    api: {
      canSnapshot,
      // A snapshot of a page that left the document is gone with it.
      getSnapshot: () => (held && ctx.getPage(held.page) ? held : null),
      clearSnapshot,
      onSnapshotChanged: changed.on,
      getSnapshotBox: (page) => {
        const current = shown();
        return current && current.page.objectNumber === page.objectNumber ? current.rect : null;
      },
    } satisfies Partial<RenderHostCapability>,

    /** Register the tool and its handler with the interaction hub, when there is one. */
    connect(): void {
      const interaction = ctx.tryGet(InteractionToken);
      if (!interaction) return;
      ctx.cleanup(
        interaction.registerTool({
          id: SNAPSHOT_TOOL,
          cursor: 'crosshair',
          touch: 'draw',
          enables: new Set([SNAPSHOT_BOX_TAG]),
        }),
      );
      ctx.cleanup(interaction.registerHandler(handler));
      // Another tool lets the snapshot go.
      ctx.listen(interaction.onToolChanged, ({ toolId }) => {
        if (toolId !== SNAPSHOT_TOOL) clearSnapshot();
      });
    },
  };
}
