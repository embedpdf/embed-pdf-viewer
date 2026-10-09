<!-- The same component in both panes: each talks to the document its <DocumentScope> names. -->
<script lang="ts">
  import { useDocument } from '@embedpdf/svelte/runtime';
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const document = useDocument();
  const stage = useStage();
  const zoomLevel = useStageState((state) => state.zoomLevel);
</script>

<div class="header">
  <strong>{document.name}</strong>
  {document.pageCount} pages
  <button type="button" class="button" aria-label="Zoom out" onclick={() => stage.zoomOut()}>
    −
  </button>
  <output class="readout">{Math.round(zoomLevel.current * 100)}%</output>
  <button type="button" class="button" aria-label="Zoom in" onclick={() => stage.zoomIn()}>
    +
  </button>
</div>
