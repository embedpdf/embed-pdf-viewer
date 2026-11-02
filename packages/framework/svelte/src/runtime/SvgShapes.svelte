<!--
  Scene shapes as SVG elements: `@embedpdf/web`'s element descriptions (`svgShapesOf`), one
  element each, a clipping `svg` with its children, and the faces their text draws in mounted
  while they show. The annotation and form layers draw their scenes through it, inside an `<svg>`.
-->
<svelte:options namespace="svg" />

<script lang="ts">
  import { styleText, type SvgShape } from '@embedpdf/web';
  import { useFontMounts } from './font-mounts.svelte';
  import SvgShapes from './SvgShapes.svelte';

  let { shapes }: { shapes: readonly SvgShape[] } = $props();

  // The faces of this level's text: a clipping `svg` mounts its own children's.
  useFontMounts(() => shapes.flatMap((shape) => (shape.program ? [shape.program] : [])));
</script>

{#each shapes as shape, index (index)}
  <svelte:element this={shape.tag} {...shape.attributes} style={styleText(shape.style)}>
    {#if shape.children}
      <SvgShapes shapes={shape.children} />
    {:else if shape.text !== undefined}
      {shape.text}
    {/if}
  </svelte:element>
{/each}
