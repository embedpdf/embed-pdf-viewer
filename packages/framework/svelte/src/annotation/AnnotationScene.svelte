<!--
  An annotation's vector drawing, filling its frame: drawn upright in it, the frame turns it. The
  core computes the box and the painted scene; `@embedpdf/web` describes each scene node as one
  SVG element, so there is no per-kind logic and no bounds math here.
-->
<script lang="ts">
  import { MITER_LIMIT, scene, type RenderItem } from '@embedpdf/core-annotation';
  import { ghostOpacity, sceneViewBox, svgShapesOf } from '@embedpdf/web';

  let { item }: { item: RenderItem } = $props();

  // Nothing to draw until the annotation has area (the 0×0 drawing at the first press).
  const viewBox = $derived(sceneViewBox(item.box));
  const shapes = $derived(viewBox ? svgShapesOf(scene(item), { miterLimit: MITER_LIMIT }) : []);
</script>

{#if viewBox}
  <!-- A ghost is see-through as a whole, so its fill and stroke don't stack. -->
  <svg
    {viewBox}
    style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none"
    style:opacity={item.source === 'ghost' ? ghostOpacity(item.ghostOpacity ?? 0.5) : undefined}
  >
    {#each shapes as shape, index (index)}
      <!-- An SVG element: Svelte takes the namespace from the `<svg>` around it. -->
      <svelte:element this={shape.tag} {...shape.attributes} style:mix-blend-mode={shape.blend}>
        {#if shape.text !== undefined}{shape.text}{/if}
      </svelte:element>
    {/each}
  </svg>
{/if}
