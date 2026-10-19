<script lang="ts">
  import { DocumentScope } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { useViewManager, useViewManagerState } from '@embedpdf/svelte/view-manager';
  import PaneTabs from './PaneTabs.svelte';

  const views = useViewManager();
  const state = useViewManagerState();
</script>

<div class="panes">
  {#each state.panes as pane (pane.id)}
    <section data-focused={pane.id === state.focusedPaneId} onfocusin={() => views.setFocusedPane(pane.id)}>
      <PaneTabs {pane} />
      {#if pane.activeDocumentId}
        <DocumentScope id={pane.activeDocumentId}>
          <Stage>
            <RenderLayer />
          </Stage>
        </DocumentScope>
      {/if}
    </section>
  {/each}
</div>
