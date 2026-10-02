<script lang="ts">
  import { useSelection } from '@embedpdf/svelte/selection';

  const selection = useSelection();
</script>

<div class="menu">
  <button type="button" onclick={() => selection.clear()}>Clear the selection</button>
</div>
