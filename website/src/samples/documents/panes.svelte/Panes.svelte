<script lang="ts">
  import { useViewManager, useViewManagerState } from '@embedpdf/svelte/view-manager';
  import Pane from './Pane.svelte';

  const views = useViewManager();
  const layout = useViewManagerState();

  // On load, both documents land in the first pane: put the second one beside it, once.
  let splitOnLoad = true;
  $effect(() => {
    const panes = layout.panes;
    if (splitOnLoad && panes.length === 1 && panes[0].documentIds.length === 2) {
      splitOnLoad = false;
      views.splitPane(panes[0].documentIds[1]);
    }
  });
</script>

<div class="panes">
  {#each layout.panes as pane (pane.id)}
    <Pane {pane} canRemove={layout.panes.length > 1} />
  {/each}
</div>
