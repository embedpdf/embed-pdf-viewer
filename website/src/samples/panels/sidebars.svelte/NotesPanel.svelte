<script lang="ts">
  import { useSurface } from '@embedpdf/svelte/shell';

  let { notes = $bindable() }: { notes: string } = $props();

  const panel = useSurface('notes');
</script>

{#if panel.isOpen}
  <aside class="panel" aria-label="Notes">
    <header class="panel-header">
      <h3 class="panel-title">Notes</h3>
      <button type="button" class="close" aria-label="Close" onclick={panel.close}>×</button>
    </header>
    <textarea
      class="field notes"
      aria-label="Notes"
      placeholder="Your notes on this document…"
      bind:value={notes}
    ></textarea>
  </aside>
{/if}
