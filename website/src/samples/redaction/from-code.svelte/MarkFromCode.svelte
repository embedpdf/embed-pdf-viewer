<script lang="ts">
  import { untrack } from 'svelte';
  import { useStageState } from '@embedpdf/svelte/stage';
  import { useSelectionState } from '@embedpdf/svelte/selection';
  import { useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useRedaction, useRedactionState } from '@embedpdf/svelte/redaction';

  const redaction = useRedaction();
  const pendingCount = useRedactionState((state) => state.pendingCount);
  const hasSelection = useSelectionState((state) => state.hasSelection);
  const currentPage = useStageState((state) => state.currentPageIndex);
  const ready = useAnnotationState((state) => state.status === 'ready');
  let text = $state('EmbedPDF');

  // On load: every "EmbedPDF" in the document.
  let started = false;
  $effect(() => {
    if (!ready.current || started) return;
    started = true;
    untrack(() => void redaction.markMatches({ text: 'EmbedPDF' }));
  });

  function markEveryMatch(event: SubmitEvent) {
    event.preventDefault();
    if (text.trim()) void redaction.markMatches({ text: text.trim() });
  }
</script>

<div class="toolbar">
  <form class="query" onsubmit={markEveryMatch}>
    <input class="field" type="search" aria-label="Text to mark" bind:value={text} />
    <button type="submit" class="button" disabled={!text.trim()}>Every match</button>
  </form>
  <button
    type="button"
    class="button"
    disabled={!hasSelection.current}
    title="Select some text on the page first"
    onclick={() => void redaction.markSelection()}
  >
    The selected text
  </button>
  <button
    type="button"
    class="button"
    onclick={() => void redaction.markPage(currentPage.current)}
  >
    This page
  </button>
  <button
    type="button"
    class="button"
    disabled={!pendingCount.current}
    onclick={() => void redaction.clearPending()}
  >
    Remove all
  </button>
  <span class="spacer"></span>
  <output class="readout">
    {pendingCount.current}
    {pendingCount.current === 1 ? 'mark' : 'marks'}
  </output>
</div>
