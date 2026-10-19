<script lang="ts">
  import { useStage } from '@embedpdf/svelte/stage';
  import type { Pin } from './pin';

  let { last, onClear }: { last: Pin | null; onClear: () => void } = $props();

  const stage = useStage();
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={() => stage.zoomOut()}>Zoom out</button>
  <button type="button" class="button" onclick={() => stage.zoomIn()}>Zoom in</button>
  <button type="button" class="button" onclick={() => stage.rotateViewBy(90)}>Rotate ⟳</button>
  <button type="button" class="button" onclick={onClear}>Clear pins</button>
  <output class="badge">
    {#if last}
      page <strong>{last.pageIndex + 1}</strong> · x <strong>{last.point.x.toFixed(1)}</strong> · y
      <strong>{last.point.y.toFixed(1)}</strong>
    {:else}
      Click a page to drop a pin
    {/if}
  </output>
</div>
