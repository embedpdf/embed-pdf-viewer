<script lang="ts">
  import { copySelection, useSelection, useSelectionState } from '@embedpdf/svelte/selection';

  const selection = useSelection();
  const state = useSelectionState();
</script>

<button
  disabled={!state.hasSelection || !selection.canCopy()}
  onclick={() => copySelection(selection)}
>
  Copy
</button>
