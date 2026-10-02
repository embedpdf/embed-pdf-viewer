<!--
  The page raster, as two planes:

  - the base plane: one whole-page image at the plugin's resolved render points (the exact
    settled demand capped at the pixel budget on a local engine, the advertised ladder on a
    cloud deployment). Always there; the instant backdrop.
  - the tile plane: the plugin's paint plan above it, which engages only when the view wants
    more pixels than the base may spend. A thumbnail-sized demand engages nothing.

  The layer only paints: every decision (which pixels, when, what to keep) is the render
  plugin's. Anything mid-gesture is scaled by CSS until the plugin hands down new pixels.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { RenderToken } from '@embedpdf/plugin-render/contract/host';
  import { usePageLayerFact } from '../runtime/dev-registry.svelte';
  import { usePage } from '../runtime/page';
  import { useOptionalCapability, useOptionalSelector } from '../runtime/readers.svelte';
  import type { RenderLayerProps } from './props';
  import TilePlane from './TilePlane.svelte';

  let { annotations = true, tiles = true }: RenderLayerProps = $props();

  const page = usePage();
  // The layer is a host of the render plugin: it paints conformed sources and drives a view's
  // tile demand. The host lens is the same runtime token, typed wider.
  const render = useOptionalCapability(RenderToken);
  // The same object until a setting it reads changes.
  const settings = useOptionalSelector(
    RenderToken,
    (renderer) => renderer.getPaintSettings(),
    null,
  );
  usePageLayerFact(page, 'renderBakesAnnotations', () => annotations);

  // The raster's identity: its conformed width, the annotations flag and the epoch. Under a
  // ladder it moves only at rung crossings; on a local engine it follows the demand up to the
  // budget, so the deep-zoom backdrop never fetches again.
  const sourceKey = useOptionalSelector(
    RenderToken,
    (renderer) =>
      renderer.getSourceKey(page.ref, {
        scale: page.transform.renderScale,
        includeAnnotations: annotations,
      }),
    null,
  );

  let image: HTMLImageElement | undefined;

  $effect(() => {
    const renderer = render.current;
    const key = sourceKey.current;
    const ref = page.ref;
    if (!renderer || key === null) return;
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    // Any scale that maps to this key gives this key's request: the plugin conforms it.
    const options = untrack(() => ({
      scale: page.transform.renderScale,
      includeAnnotations: annotations,
    }));
    void (async () => {
      try {
        const raster = await renderer.renderSource(ref, { ...options, signal: controller.signal });
        const objectUrl = await raster.objectUrl().abortWith(controller.signal);
        if (controller.signal.aborted) {
          objectUrl.revoke();
          return;
        }
        revoke = objectUrl.revoke;
        // The source is set on a stable element: the browser keeps the old picture until the new
        // one decodes, and never asks for the old URL again, so revoking it on cleanup is safe.
        if (image) image.src = objectUrl.url;
      } catch {
        // Cancelled (the camera moved, the layer unmounted) or the render failed.
      }
    })();
    return () => {
      controller.abort();
      revoke?.();
    };
  });
</script>

<img
  bind:this={image}
  alt=""
  draggable="false"
  style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none"
/>
{#if tiles && settings.current?.tiles}
  <TilePlane {annotations} fadeMs={settings.current.fadeMs} />
{/if}
