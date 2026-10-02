<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageRef } from '@embedpdf/svelte/runtime';
  import {
    useStage,
    useStageState,
    type StageViewState,
    type Viewpoint,
  } from '@embedpdf/svelte/stage';

  const stage = useStage();
  const stageState = useStageState();
  // One spot on one page, and the whole view: settings and position.
  let spot = $state.raw<{ page: PageRef; viewpoint: Viewpoint; label: string } | null>(null);
  let view = $state.raw<StageViewState | null>(null);

  function rememberSpot() {
    const page = stage.getCurrentPage();
    if (!page) return;
    const label = `page ${stage.getCurrentPageIndex() + 1}`;
    spot = { page, viewpoint: stage.getViewpoint(), label };
  }

  // Remember where the reader starts, so "Go back" works right away.
  onMount(rememberSpot);
</script>

<div class="toolbar">
  <div class="group">
    <button type="button" class="button" onclick={rememberSpot}>Remember this spot</button>
    <button
      type="button"
      class="button"
      disabled={!spot}
      onclick={() => spot && stage.goToPage(spot.page, { viewpoint: spot.viewpoint })}
    >
      Go back{spot ? ` to ${spot.label}` : ''}
    </button>
  </div>
  <div class="group">
    <button type="button" class="button" onclick={() => (view = stage.getViewState())}>
      Save the view
    </button>
    <button
      type="button"
      class="button"
      disabled={!view}
      onclick={() => view && stage.applyViewState(view)}
    >
      Restore it
    </button>
  </div>
  <output class="badge">
    page <strong>{stageState.currentPageIndex + 1}</strong> ·
    <strong>{Math.round(stageState.zoomLevel * 100)}%</strong>
  </output>
</div>
