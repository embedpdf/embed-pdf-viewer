<script lang="ts">
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const stageState = useStageState();
  let typed = $state('');

  // People count from 1, an index from 0. An index past the end goes to the last page.
  function jump() {
    const number = Number(typed);
    if (Number.isInteger(number) && number >= 1) stage.goToPage(number - 1);
    typed = '';
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!stage.canGoPrevious()}
    onclick={() => stage.previousPage()}
  >
    ‹ Previous
  </button>
  <output class="badge">
    Page <strong>{stageState.currentPageIndex + 1} / {stageState.pageCount}</strong>
  </output>
  <button
    type="button"
    class="button"
    disabled={!stage.canGoNext()}
    onclick={() => stage.nextPage()}
  >
    Next ›
  </button>
  <input
    class="field"
    inputmode="numeric"
    aria-label="Go to page"
    placeholder="Go to page…"
    bind:value={typed}
    onkeydown={(event) => event.key === 'Enter' && jump()}
  />
</div>
