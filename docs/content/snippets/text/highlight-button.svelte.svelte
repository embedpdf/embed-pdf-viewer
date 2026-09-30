<script lang="ts">
  import { useSelectionState } from '@embedpdf/svelte/selection';

  const state = useSelectionState(); // state.hasSelection, state.isSelecting, state.pages
</script>

<button disabled={!state.hasSelection}>Highlight</button>
