/**
 * RenderLayer — the React view of @embedpdf/plugin-render.
 *
 * Paints a page to an <img> from the engine's ENCODED image() (identical for local
 * & cloud). Abortable (cancels when the camera moves / the layer unmounts) and
 * leak-free (revokes the object URL).
 */

// One-line-per-feature (ADAPTERS.md): registration travels with the UI.
export * from '@embedpdf/plugin-render';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { RenderToken } from '@embedpdf/plugin-render';
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
  // Refetch when a CONFIRMED mutation (own or a collaborator's) changes what
  // this render would paint — an annotation moved, a checkbox ticked. Bumps at
  // commit, never mid-gesture; annotation-free renders subscribe to nothing.
  const epoch = useSelector(RenderToken, (c) => c.renderEpoch(page.pon, annotations));
  useEffect(() => {
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    (async () => {
      try {
        // Render at the transform's exact device scale — width pinned, height the
        // engine's derived value — so the bitmap matches its box 1:1 (no blur), with
        // dpr already folded in. No `* dpr` guesswork in the adapter.
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
  }, [render, page.pon, page.transform.renderScale, annotations, epoch]);
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
