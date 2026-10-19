<script lang="ts">
  import { useSurface } from '@embedpdf/svelte/shell';

  const panel = useSurface('notes');
</script>

{#if panel.isOpen}
  <aside class="panel" aria-label="Notes">
    <h3 class="panel-title">Notes</h3>
    <textarea class="notes" aria-label="Notes" placeholder="Your notes on this document…"
    ></textarea>
  </aside>
{/if}
