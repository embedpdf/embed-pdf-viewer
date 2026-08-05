/**
 * RenderLayer + TileLayer — the React views of @embedpdf/plugin-render.
 *
 * RenderLayer paints the BASE rung to an <img> from the engine's ENCODED
 * image() (identical for local & cloud). TileLayer paints the tile paint-plan
 * ABOVE it when the deployment lattice caps the base below the demand — mount
 * it per lens (the main stage yes, a thumbnail rail no); where the demand is
 * small it engages nothing. Both are dumb painters: every decision (policy
 * conformance, want sets, retention, release) is plugin-render's.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-render';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { RenderToken } from '@embedpdf/plugin-render';
import type { PageViewDemand, TilePaintSource } from '@embedpdf/plugin-render';
import { useCapability, usePage, useSelector } from './runtime';

export interface RenderLayerProps {
  /**
   * Bake annotations into the page bitmap (default true). Pass false when an
   * <AnnotationLayer> owns annotation rendering, so they aren't drawn twice.
   */
  annotations?: boolean;
}

export function RenderLayer({ annotations = true }: RenderLayerProps = {}) {
  const page = usePage();
  const render = useCapability(RenderToken);
  const ref = useRef<HTMLImageElement>(null);
  // ONE dependency: the raster's canonical identity — conformed viewport +
  // annotations flag + epoch (SCALE-OUT §2.1e identity law). Inside a lattice
  // rung, zoom changes don't move it: no refetch, no DOM churn — the stage's
  // CSS transform does the scaling. It changes exactly at rung crossings and
  // on CONFIRMED mutations (epoch bumps at commit, never mid-gesture). Under
  // `continuous` it embeds the exact scale — v2 behavior byte-for-byte. The
  // policy behind it is a document fact the kernel materialized before
  // publish, so the key is always computable.
  const sourceKey = useSelector(RenderToken, (c) =>
    c.renderSourceKey(page.pon, {
      scale: page.transform.renderScale,
      includeAnnotations: annotations,
    }),
  );
  useEffect(() => {
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    (async () => {
      try {
        // The capability conforms this to the policy (lattice → ladder width,
        // continuous → this exact scale) and collapses same-key asks in its
        // raster store. A stale-closure scale is harmless by construction:
        // any scale in this rung produces this key's canonical request.
        const image = await render.renderPage(page.pon, {
          scale: page.transform.renderScale,
          includeAnnotations: annotations,
          signal: controller.signal,
        });
        const obj = await image.objectUrl(controller.signal);
        if (controller.signal.aborted) {
          obj.revoke();
          return;
        }
        revoke = obj.revoke;
        if (ref.current) ref.current.src = obj.url;
      } catch {
        /* aborted (camera moved / unmounted) or render failed */
      }
    })();
    return () => {
      controller.abort();
      revoke?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceKey IS the
    // render identity; scale/annotations/epoch are folded into it upstream.
  }, [render, page.pon, sourceKey]);
  return (
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
  );
}

export interface TileLayerProps {
  /**
   * Bake annotations into tile bitmaps (default true). Pass false when an
   * <AnnotationLayer> owns annotation rendering — the composition that keeps
   * tile artifacts annotation-version-free (CDN-stable across edits).
   */
  annotations?: boolean;
}

/**
 * TileLayer — the sharp plane above the base rung (SCALE-OUT §2.1e).
 *
 * Mounting it is the per-lens OPT-IN; whether it spends anything is demand
 * arithmetic (a thumbnail rail's demand never engages). The paint list is the
 * plugin's retention-safe plan: keyed <img>s inside ONE container that carries
 * the page scale as a single transform (one rounding context — no tile seams),
 * with `onLoad` reporting the decode boundary back so retained coarser
 * generations release only when their replacement is truly on screen.
 */
export function TileLayer({ annotations = true }: TileLayerProps = {}) {
  const page = usePage();
  const render = useCapability(RenderToken);
  // Demand: the host's live camera view (Stage) or whole-page (PageView).
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
  const scale = t.viewScale;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: t.contentWidth / scale,
        height: t.contentHeight / scale,
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
      }}
    >
      {plan.paint.map((source) => (
        <TileImg
          key={source.key}
          source={source}
          onPainted={() => render.tilePainted(page.pon, source.key)}
        />
      ))}
    </div>
  );
}

/** One tile: object-URL lifecycle + the painted (decode-boundary) report. */
function TileImg({ source, onPainted }: { source: TilePaintSource; onPainted: () => void }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    (async () => {
      try {
        const obj = await source.handle.objectUrl(controller.signal);
        if (controller.signal.aborted) {
          obj.revoke();
          return;
        }
        revoke = obj.revoke;
        if (ref.current) ref.current.src = obj.url;
      } catch {
        /* aborted (plan moved on) */
      }
    })();
    return () => {
      controller.abort();
      revoke?.();
    };
  }, [source.handle]);
  return (
    <img
      ref={ref}
      alt=""
      draggable={false}
      onLoad={onPainted}
      style={{
        position: 'absolute',
        left: source.rect.x,
        top: source.rect.y,
        width: source.rect.width,
        height: source.rect.height,
        zIndex: source.z,
      }}
    />
  );
}
