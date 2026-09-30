<script lang="ts">
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const state = useStageState();
</script>

<nav>
  <button onclick={() => stage.previousPage()}>Previous</button>
  <span>{state.currentPageIndex + 1} of {state.pageCount}</span>
  <button onclick={() => stage.nextPage()}>Next</button>
</nav>
