<script lang="ts" module>
  const TIPS = [
    'Ctrl or ⌘ and scroll to zoom',
    'Pinch to zoom on a touch screen',
    'Drag between pages to scroll',
  ];
</script>

<script lang="ts">
  import { useSurface } from '@embedpdf/svelte/shell';

  const panel = useSurface('tips');
</script>

{#if panel.isOpen}
  <aside class="panel" aria-label="Tips">
    <h3 class="panel-title">Tips</h3>
    <ul class="tips">
      {#each TIPS as tip (tip)}
        <li>{tip}</li>
      {/each}
    </ul>
  </aside>
{/if}
