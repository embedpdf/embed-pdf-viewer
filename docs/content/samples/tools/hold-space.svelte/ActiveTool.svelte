<script lang="ts">
  import { useInteractionState } from '@embedpdf/svelte/interaction';

  const state = useInteractionState();
  const panning = $derived(state.activeToolId === 'pan');
</script>

<div class="toolbar">
  <span class="badge" data-active={panning}>{panning ? 'Hand' : 'Select'}</span>
  <span class="readout">
    {panning ? 'Drag to scroll, then let go of Space' : 'Hold Space over the pages to scroll'}
  </span>
</div>
