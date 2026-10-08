<!--
  The sharp plane above the base: the render plugin's paint plan for this view and page, as
  keyed images. Each tile reports itself painted after its first chance to show (and the inverse
  when it leaves), so older, coarser tiles are released only once their replacement shows.

  Tiles are placed in view pixels, never in page points under a scaled container: browsers round
  layout lengths to 1/64 of a CSS pixel before transforms apply, and under a large zoom transform
  that rounding becomes visible seams. In view pixels it stays 1/64 of a pixel at every zoom.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { RenderToken, type ViewDemand } from '@embedpdf/plugin-render/contract/host';
  import { usePage } from '../runtime/page';
  import { useKernelValue, useOptionalCapability } from '../runtime/readers.svelte';
  import TileImage from './TileImage.svelte';

  let { annotations }: { annotations: boolean } = $props();

  const page = usePage();
  const render = useOptionalCapability(RenderToken);

  // Which page and which view this plane plans for. The page context is a new value whenever the
  // camera changes it; these change only when the page or the view does (a `<PageView>` can be
  // given another page), so the handle and the page's claim on it follow ownership, never the
  // camera.
  const pageRef = $derived(page.ref);
  const viewId = $derived(page.view);

  // This view's tile surface: planning state is per view and page, so a thumbnail rail's demand
  // can't disturb the main view's tiles. Reference-counted: one `dispose` per `createViewDemand`.
  let view = $state.raw<ViewDemand | null>(null);
  $effect(() => {
    const renderer = render.current;
    const id = viewId;
    if (!renderer) return;
    const created = untrack(() => renderer.createViewDemand(id));
    view = created;
    return () => created.dispose();
  });

  // Demand in, plan out: setting the demand is the one call that schedules fetches and plans
  // again. Before the DOM updates, and again on every camera frame (the page's view demand reads
  // the frame), so a move plans before the browser paints.
  $effect.pre(() => {
    const surface = view;
    if (!surface) return;
    const demand = page.getViewDemand?.() ?? { desiredDeviceWidth: page.transform.deviceWidth };
    const ref = pageRef;
    const includeAnnotations = annotations;
    untrack(() => surface.setDemand(ref, demand, { includeAnnotations }));
  });

  // The same object until the demand, an epoch or an arriving tile changes it.
  const plan = useKernelValue(() => view?.getPlan(pageRef) ?? null);

  // Leaving the page (another page, or the plane unmounts) stops its in-flight fetches; the bytes
  // already here stay cached.
  $effect(() => {
    const surface = view;
    const ref = pageRef;
    if (!surface) return;
    return () => surface.release(ref);
  });
</script>

{#if plan.current && plan.current.paint.length > 0}
  <!-- A stacking context of its own: tiles carry z-index ranks (coarse under fine) while two
       generations mix, mid-zoom, and without it those ranks would paint above the annotations,
       the page chrome and the menus. -->
  <div
    style="position: absolute; left: 0; top: 0; pointer-events: none; isolation: isolate"
    style:width="{page.transform.contentWidth}px"
    style:height="{page.transform.contentHeight}px"
  >
    {#each plan.current.paint as source (source.key)}
      <TileImage
        {source}
        viewScale={page.transform.viewScale}
        onPainted={() => view?.markPainted(pageRef, source.key)}
        onUnpainted={() => view?.markUnpainted(pageRef, source.key)}
      />
    {/each}
  </div>
{/if}
