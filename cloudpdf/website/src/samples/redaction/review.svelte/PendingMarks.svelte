<script lang="ts">
  import { useStage } from '@embedpdf/svelte/stage';
  import { annotationKey } from '@embedpdf/svelte/annotation';
  import {
    usePendingRedactions,
    useRedaction,
    useRedactionState,
  } from '@embedpdf/svelte/redaction';

  const stage = useStage();
  const redaction = useRedaction();
  const marks = usePendingRedactions(); // the marks not applied yet, in page order
  const pendingCount = useRedactionState((state) => state.pendingCount);
</script>

<div class="panel">
  <div class="panel-head">
    <span class="readout">
      {pendingCount.current}
      {pendingCount.current === 1 ? 'mark' : 'marks'}
    </span>
    <button
      type="button"
      class="button"
      disabled={!pendingCount.current}
      onclick={() => void redaction.clearPending()}
    >
      Remove all
    </button>
  </div>
  <ul class="marks">
    {#each marks.current as mark (annotationKey(mark.ref))}
      <li class="mark">
        <button
          type="button"
          class="mark-go"
          onclick={() => stage.reveal(mark.page, { rect: mark.bounds })}
        >
          <span class="mark-page">Page {mark.pageIndex + 1}</span>
          <span class="mark-kind">{mark.kind === 'text' ? 'Text' : 'Area'}</span>
        </button>
        <button
          type="button"
          class="button"
          disabled={!redaction.canUnmark(mark.ref)}
          onclick={() => void redaction.unmark([mark.ref])}
        >
          Remove
        </button>
      </li>
    {/each}
  </ul>
</div>
