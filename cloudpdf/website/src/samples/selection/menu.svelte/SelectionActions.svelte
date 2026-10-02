<!-- What's in the menu is yours: here, copy and clear. -->
<script lang="ts">
  import { copySelection, useSelection } from '@embedpdf/svelte/selection';

  const selection = useSelection();

  function copy() {
    void copySelection(selection).catch(() => {
      // Show your product's clipboard error message here.
    });
  }
</script>

<div class="menu">
  {#if selection.canCopy()}
    <button type="button" class="button" onclick={copy}>Copy</button>
  {/if}
  <button type="button" class="button" onclick={() => selection.clear()}>Clear</button>
</div>
