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
 * The layer is a DUMB painter, deliberately thin: plain <img>s bound through
 * the shared browser adapter, with painted/unpainted reports around their
 * visible lifetime. Every decision — strategy ∧ policy conformance, want
 * sets, level settling, retention, release — is plugin-render's; anything
 * mid-gesture simply CSS-scales until the plugin hands down new pixels.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-render';
import * as React from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { RenderToken } from '@embedpdf/plugin-render';
import type { PageViewDemand, TilePaintSource } from '@embedpdf/plugin-render';
import { bindPaintedImage } from '@embedpdf/web';
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

let warnedTileSize = false;

export function RenderLayer({ annotations = true, tiles = true }: RenderLayerProps = {}) {
  const page = usePage();
  const render = useCapability(RenderToken);
  const settings = render.paintSettings();
  const ref = useRef<HTMLImageElement>(null);

  // ONE dependency: the raster's canonical identity — conformed width +
  // annotations flag + epoch. Under a lattice it moves only at rung
  // crossings; under exact mode it tracks the demand and is CONSTANT above
  // the budget — so the deep-zoom backdrop never refetches, and the sub-
  // budget range refetches per settled demand exactly like v2 did.
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
        // The capability conforms this to the resolved render points and
        // collapses same-key asks in its raster store. A stale-closure scale
        // is harmless by construction: any scale mapping to this key
        // produces this key's canonical request.
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
        // Imperative src on a STABLE element: the browser keeps the old
        // bitmap until the new one decodes, and nothing ever re-requests the
        // old URL — so revoke-on-cleanup is safe here by construction.
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
 * as keyed <img>s. Each tile reports painted after its first presentation
 * opportunity (and its inverse on unmount), so retained coarser generations
 * release only when their replacement is truly compositable.
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
  // THIS view's tile surface: state is per view × page, so a thumbnail
  // rail's never-engaging demand cannot disturb the main lens's plan (shared
  // state made the main view lose its tiles whenever a rail opened). The
  // handle is reference-stable per view — a clean dependency.
  const tiles = render.tilesFor(page.view);
  const plan = useSelector(RenderToken, () =>
    tiles.plan(page.pon, demand, { includeAnnotations: annotations }),
  );
  // View unmounted its plane: stop in-flight fetches; resolved bytes stay cached.
  useEffect(() => () => tiles.release(page.pon), [tiles, page.pon]);
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
        // STACKING CONTRACT: tile <img>s carry zIndex ranks (coarse under
        // fine) that exist only while generations are mixed — mid-zoom. This
        // container MUST be a stacking context so those ranks stay internal;
        // without it they join the Stage's context and paint above every
        // z-auto sibling (annotations, page chrome, menus) exactly while
        // zooming. The old scaled container created one implicitly via its
        // transform; `isolation` is the explicit, no-side-effect way.
        isolation: 'isolate',
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
          onPainted={() => tiles.painted(page.pon, source.key)}
          onUnpainted={() => tiles.unpainted(page.pon, source.key)}
        />
      ))}
    </div>
  );
}

/** One tile: geometry plus the shared browser image binding. The binding
 *  hides the incomplete image, reports painted after its first presentation
 *  opportunity, and inverts that report when the element leaves the DOM. */
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
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    return bindPaintedImage(ref.current, source.handle, { onPainted, onUnpainted });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handle is
    // the bitmap's identity; the report callbacks carry stable values.
  }, [source.handle]);
  return (
    <img
      ref={ref}
      alt=""
      draggable={false}
      onLoad={(e) => {
        // A raster whose intrinsic size disagrees with its rect would be
        // silently stretched into place — the stale-handle bug class.
        const w = e.currentTarget.naturalWidth;
        if (w > 0 && !warnedTileSize) {
          const expected = Math.round(source.rect.width * source.scale);
          if (Math.abs(w - expected) > 1) {
            warnedTileSize = true;
            console.warn(
              `[render] tile bitmap ${w}px wide does not match its rect ` +
                `(expected ~${expected}px) — stale raster identity? key=${source.key}`,
            );
          }
        }
      }}
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
