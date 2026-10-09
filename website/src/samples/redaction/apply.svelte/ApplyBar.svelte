<script lang="ts">
  import { untrack } from 'svelte';
  import { saveFile, useDocuments } from '@embedpdf/svelte/runtime';
  import { useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useRedaction, useRedactionState } from '@embedpdf/svelte/redaction';

  // The cover's title, in page coordinates: the shapes drawn over it go with it.
  const TITLE = { x: 100, y: 212, width: 392, height: 156 };

  const redaction = useRedaction();
  const documents = useDocuments();
  const redactionState = useRedactionState();
  const ready = useAnnotationState((state) => state.status === 'ready');
  let asking = $state(false);

  // On load: the title marked.
  let started = false;
  $effect(() => {
    if (!ready.current || started) return;
    started = true;
    untrack(() => void redaction.markArea(0, TITLE));
  });

  const marks = (count: number) => `${count} ${count === 1 ? 'mark' : 'marks'}`;

  // The other annotations applying removes too: they could show what was there. Read as the
  // question is drawn, next to the mark count, so it follows the marks.
  function collateral() {
    const { count } = redaction.estimateCollateral();
    return count > 0 ? `${count} ${count === 1 ? 'annotation' : 'annotations'} under them go too. ` : '';
  }

  function redactForGood() {
    void redaction.applyAll().finally(() => (asking = false));
  }

  function download() {
    void documents
      .download(undefined, { mode: 'rewrite' })
      .then((bytes) => saveFile(bytes, 'redacted.pdf', 'application/pdf'));
  }
</script>

{#if asking}
  <div class="toolbar confirm" role="alertdialog" aria-label="Redact for good?">
    <span class="readout">
      Redact {marks(redactionState.pendingCount)}? {collateral()}This can’t be undone.
    </span>
    <span class="spacer"></span>
    <button type="button" class="button" onclick={() => (asking = false)}>Cancel</button>
    <button
      type="button"
      class="button danger"
      disabled={redactionState.applying}
      onclick={redactForGood}
    >
      Redact for good
    </button>
  </div>
{:else}
  <div class="toolbar">
    <button
      type="button"
      class="button danger"
      disabled={!redactionState.pendingCount || !redaction.canApply()}
      onclick={() => (asking = true)}
    >
      Redact…
    </button>
    <button
      type="button"
      class="button"
      disabled={!redactionState.lastResult}
      title="A fresh file, without the earlier revision that still holds the content"
      onclick={download}
    >
      Download
    </button>
    <span class="spacer"></span>
    <output class="readout">
      {redactionState.lastResult
        ? `Gone for good, with ${redactionState.lastResult.removedAnnotationCount} other annotations`
        : `${marks(redactionState.pendingCount)} waiting`}
    </output>
  </div>
{/if}
