<!-- The active tab: rename it, move it to the front, and zoom it. Each tab keeps its own zoom. -->
<script lang="ts">
  import { useDocument, useDocuments } from '@embedpdf/svelte/runtime';
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const documents = useDocuments();
  const tab = useDocument();
  const stage = useStage();
  const zoomLevel = useStageState((state) => state.zoomLevel);
</script>

<div class="toolbar">
  <input
    class="field"
    aria-label="Tab name"
    value={tab.name ?? ''}
    oninput={(event) => documents.rename(tab.id, event.currentTarget.value)}
  />
  <button type="button" class="button" onclick={() => documents.move(tab.id, 0)}>
    Move to front
  </button>
  <button type="button" class="button" aria-label="Zoom out" onclick={() => stage.zoomOut()}>
    −
  </button>
  <button type="button" class="button" aria-label="Zoom in" onclick={() => stage.zoomIn()}>
    +
  </button>
  <output class="readout">{Math.round(zoomLevel.current * 100)}%</output>
</div>
