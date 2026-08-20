/**
 * RenderLayer — the React view of @embedpdf/plugin-render. The page raster
 * is ONE concern with two planes:
 *
 *   - the BASE plane: a whole-page <img> at the plugin's resolved render
 *     points — the exact settled demand capped at the pixel budget on a
 *     continuous (local) engine, the advertised ladder on a lattice (cloud)
 *     deployment. Always present; the instant backdrop.
 *   - the TILE plane: the plugin's retention-safe paint plan above it,
 *     engaging by demand arithmetic when the view wants more pixels than
 *     the base may spend. A thumbnail-sized demand engages nothing — the
 *     arithmetic is the configuration.
 *
 * Both planes paint at the DECODE boundary: bitmaps are decoded off-DOM
 * (`img.decode()`) before they're committed, so a swap never flashes and
 * retained coarser tiles release only against pixels that are provably
 * compositable. Mid-gesture, existing pixels CSS-scale; new demand is
 * adopted when it settles (the plugin's `settleMs`), which is what makes
 * exact-at-rest rendering affordable.
 *
 * The layer is a dumb painter: every decision (strategy ∧ policy
 * conformance, want sets, retention, release) is plugin-render's.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-render';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { RenderToken } from '@embedpdf/plugin-render';
import type { PageViewDemand, TilePaintSource } from '@embedpdf/plugin-render';
import { useCapability, usePage, useSelector } from './runtime';

export interface RenderLayerProps {
  /**
   * Bake annotations into the page bitmap (default true). Pass false when an
   * <AnnotationLayer> owns annotation rendering, so they aren't drawn twice.
   */
  annotations?: boolean;
  /**
   * Mount the tile plane (default true). Whether it SPENDS anything is
   * demand arithmetic — leave it on; pass false only for a lens that must
   * never tile even under deep zoom.
   */
  tiles?: boolean;
}

/**
 * Adopt a changing value when it SETTLES: an idle→change adopts immediately
 * (button zoom, fit modes — no added latency); changes arriving in a rapid
 * stream (pinch, wheel scrub) adopt trailing-edge after `settleMs` of rest.
 * Mid-stream the caller keeps painting the previous value — for a raster
 * key that means the current pixels CSS-scale until the gesture rests.
 */
function useSettled<T>(value: T, settleMs: number): T {
  const [settled, setSettled] = useState(value);
  const stream = useRef({ last: 0 });
  useEffect(() => {
    if (Object.is(value, settled)) return;
    const now = Date.now();
    const streaming = now - stream.current.last < Math.max(250, settleMs);
    stream.current.last = now;
    if (!streaming || settleMs <= 0) {
      setSettled(value);
      return;
    }
    const timer = setTimeout(() => setSettled(value), settleMs);
    return () => clearTimeout(timer);
  }, [value, settled, settleMs]);
  return settled;
}

/** Resolve a handle to an object URL and decode it off-DOM. Returns null if
 *  aborted; the caller owns the revoke on success. `width`/`height` are the
 *  decoded bitmap's intrinsic dimensions (0 when no DOM Image exists). */
async function decodeToUrl(
  handle: { objectUrl(signal?: AbortSignal): Promise<{ url: string; revoke(): void }> },
  signal: AbortSignal,
): Promise<{ url: string; revoke(): void; width: number; height: number } | null> {
  const obj = await handle.objectUrl(signal);
  if (signal.aborted) {
    obj.revoke();
    return null;
  }
  let width = 0;
  let height = 0;
  if (typeof Image !== 'undefined') {
    const probe = new Image();
    probe.src = obj.url;
    // decode() failure OR stall falls through to a plain commit — the <img>
    // itself will still decode-and-paint, just without the flash guarantee.
    // The timeout matters: decode() can stay pending forever (it does not
    // reject on decoder-queue pressure), and a commit that never happens
    // means a painted report that never fires — which would deadlock
    // retention on that tile. The gate is an optimization, never a wall.
    await Promise.race([
      probe.decode().catch(() => {}),
      new Promise<void>((res) => setTimeout(res, 300)),
    ]);
    width = probe.naturalWidth;
    height = probe.naturalHeight;
  }
  if (signal.aborted) {
    obj.revoke();
    return null;
  }
  return { ...obj, width, height };
}

let warnedTileSize = false;

export function RenderLayer({ annotations = true, tiles = true }: RenderLayerProps = {}) {
  const page = usePage();
  const render = useCapability(RenderToken);
  const settings = render.paintSettings();
  const ref = useRef<HTMLImageElement>(null);
  // The displayed raster's object URL — revoked only AFTER its replacement
  // has decoded and swapped in (double-buffer), never while on screen.
  const live = useRef<{ url: string; revoke(): void } | null>(null);

  // ONE dependency: the raster's canonical identity — conformed width +
  // annotations flag + epoch. Under a lattice it moves only at rung
  // crossings; under exact mode it tracks the demand (and is CONSTANT above
  // the budget), so the settle below is the whole gesture story: mid-pinch
  // the previous raster CSS-scales, the settled key re-renders at rest.
  const rawKey = useSelector(RenderToken, (c) =>
    c.renderSourceKey(page.pon, {
      scale: page.transform.renderScale,
      includeAnnotations: annotations,
    }),
  );
  const sourceKey = useSettled(rawKey, settings.settleMs);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        // The capability conforms this to the resolved render points and
        // collapses same-key asks in its raster store. A stale-closure scale
        // is harmless by construction: any scale mapping to this key
        // produces this key's canonical request.
        const image = await render.renderPage(page.pon, {
          scale: page.transform.renderScale,
          includeAnnotations: annotations,
          signal: controller.signal,
        });
        const obj = await decodeToUrl(image, controller.signal);
        if (!obj) return;
        const previous = live.current;
        live.current = obj;
        if (ref.current) ref.current.src = obj.url;
        previous?.revoke();
      } catch {
        /* aborted (camera moved / unmounted) or render failed */
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceKey IS the
    // render identity; scale/annotations/epoch are folded into it upstream.
  }, [render, page.pon, sourceKey]);

  // The displayed URL outlives individual effects; revoke it on unmount.
  useEffect(
    () => () => {
      live.current?.revoke();
      live.current = null;
    },
    [],
  );

  return (
    <>
      <img
        ref={ref}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {tiles && settings.tiles ? (
        <TilePlane annotations={annotations} fadeMs={settings.fadeMs} />
      ) : null}
    </>
  );
}

/**
 * The sharp plane above the base — the plugin's retention-safe paint plan
 * as keyed <img>s. Each tile reports the decode boundary back (and its
 * inverse on unmount), so retained coarser generations release only when
 * their replacement is truly compositable.
 *
 * Tiles are placed in VIEW (CSS px) space directly — never in page points
 * under a scaled container. Blink quantizes layout lengths to 1/64 CSS px
 * BEFORE transforms apply, so a pt-space rect under a ×25 zoom transform
 * turns that harmless 1/64 into ±0.4px+ of per-tile misplacement — visible
 * seams and per-zoom-step letter shifts that grow with depth. In view
 * space the same quantization is a fixed ~1/64 CSS px at every zoom.
 * (v2 placed tiles in screen px for exactly this reason.)
 */
function TilePlane({ annotations, fadeMs }: { annotations: boolean; fadeMs: number }) {
  const page = usePage();
  const render = useCapability(RenderToken);
  // Demand: the host's live camera view (Stage) or whole-page (PageView).
  // Level settling lives in the plugin (its settle gate), pan stays live.
  const demand: PageViewDemand = page.getViewDemand?.() ?? {
    desiredDeviceWidth: page.transform.deviceWidth,
  };
  const plan = useSelector(RenderToken, (c) =>
    c.tilePlan(page.pon, demand, { includeAnnotations: annotations }),
  );
  // Lens unmounted: stop in-flight tile fetches; resolved bytes stay cached.
  useEffect(() => () => render.releaseTiles(page.pon), [render, page.pon]);
  if (plan.paint.length === 0) return null;
  const t = page.transform;
  const s = t.viewScale;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: t.contentWidth,
        height: t.contentHeight,
        pointerEvents: 'none',
      }}
    >
      {fadeMs > 0 ? (
        <style>{`@keyframes epdf-tile-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
      ) : null}
      {plan.paint.map((source) => (
        <TileImg
          key={source.key}
          source={source}
          view={{
            x: source.rect.x * s,
            y: source.rect.y * s,
            width: source.rect.width * s,
            height: source.rect.height * s,
          }}
          fadeMs={fadeMs}
          onPainted={() => render.tilePainted(page.pon, source.key)}
          onUnpainted={() => render.tileUnpainted(page.pon, source.key)}
        />
      ))}
    </div>
  );
}

/** One tile: decode-gated object-URL lifecycle + the painted/unpainted
 *  reports. The <img> enters the DOM only with a decoded bitmap behind it,
 *  so arrival never flashes a blank tile-shaped quad. */
function TileImg({
  source,
  view,
  fadeMs,
  onPainted,
  onUnpainted,
}: {
  source: TilePaintSource;
  /** Placement rect in VIEW (CSS px) space. */
  view: { x: number; y: number; width: number; height: number };
  fadeMs: number;
  onPainted: () => void;
  onUnpainted: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const revoke = useRef<(() => void) | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const obj = await decodeToUrl(source.handle, controller.signal);
        if (!obj) return;
        // A raster whose intrinsic size disagrees with its rect would be
        // silently stretched into place — the stale-handle bug class. The
        // expected size is the engine's own rounding of rect × scale.
        if (obj.width > 0 && !warnedTileSize) {
          const expected = Math.round(source.rect.width * source.scale);
          if (Math.abs(obj.width - expected) > 1) {
            warnedTileSize = true;
            console.warn(
              `[render] tile bitmap ${obj.width}px wide does not match its rect ` +
                `(expected ~${expected}px) — stale raster identity? key=${source.key}`,
            );
          }
        }
        revoke.current = obj.revoke;
        setUrl(obj.url);
      } catch {
        /* aborted (plan moved on) */
      }
    })();
    return () => {
      controller.abort();
      revoke.current?.();
      revoke.current = null;
    };
  }, [source.handle]);
  // Post-commit: the decoded <img> is in the tree — report the decode
  // boundary so retention can release what this tile now occludes. The
  // cleanup is the INVERSE report: once this <img> leaves the DOM its
  // pixels are no longer compositable, and retention must not count them.
  useEffect(() => {
    if (!url) return;
    onPainted();
    return onUnpainted;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- painted is
    // per-bitmap: fire once per decoded URL commit, invert on removal.
  }, [url]);
  if (!url) return null;
  return (
    <img
      alt=""
      src={url}
      draggable={false}
      style={{
        position: 'absolute',
        left: view.x,
        top: view.y,
        width: view.width,
        height: view.height,
        zIndex: source.z,
        ...(fadeMs > 0 ? { animation: `epdf-tile-in ${fadeMs}ms ease-out` } : null),
      }}
    />
  );
}
