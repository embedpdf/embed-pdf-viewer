<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';

  // Your own data: points in page coordinates, by the page's object number.
  const pins = new Map<number, { x: number; y: number }[]>();
</script>

<Stage>
  {#snippet page(page)}
    <RenderLayer />
    {#each pins.get(page.ref.objectNumber) ?? [] as point}
      <!-- page coordinates → pixels on this page, at its zoom; the page turns them with it -->
      {@const at = page.transform.toPixels(point)}
      <div style:position="absolute" style:left="{at.x}px" style:top="{at.y}px">📌</div>
    {/each}
  {/snippet}
</Stage>
