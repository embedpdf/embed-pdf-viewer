<script lang="ts">
  import { copySelection, useSelection } from '@embedpdf/svelte/selection';

  const selection = useSelection();
</script>

<button
  type="button"
  class="button"
  disabled={!selection.canCopy()}
  onclick={() => void copySelection(selection).catch(() => {})}
>
  Copy
</button>
