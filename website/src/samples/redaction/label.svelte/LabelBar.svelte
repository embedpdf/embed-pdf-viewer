<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotationState } from '@embedpdf/svelte/annotation';
  import {
    usePendingRedactions,
    useRedaction,
    useRedactionState,
  } from '@embedpdf/svelte/redaction';

  // The cover's subtitle, in page coordinates.
  const SUBTITLE = { x: 100, y: 378, width: 352, height: 114 };

  const redaction = useRedaction();
  const stage = useStage();
  const redactionState = useRedactionState();
  const pending = usePendingRedactions();
  const mark = $derived(pending.current[0]);
  const ready = useAnnotationState((state) => state.status === 'ready');
  let text = $state('Classified');

  // On load: the subtitle marked, with a label that fills the area.
  let started = false;
  $effect(() => {
    if (!ready.current || started) return;
    started = true;
    untrack(() => {
      void redaction
        .markArea(0, SUBTITLE)
        .then(({ mark: marked }) =>
          redaction.updateLabel(marked.ref, { overlayText: 'Classified', repeat: true }),
        )
        .then(() => stage.reveal(0, { rect: SUBTITLE }));
    });
  });

  function setLabel(event: SubmitEvent) {
    event.preventDefault();
    if (mark) void redaction.updateLabel(mark.ref, { overlayText: text.trim() || null });
  }

  function setRepeat(event: Event & { currentTarget: HTMLInputElement }) {
    if (mark) void redaction.updateLabel(mark.ref, { repeat: event.currentTarget.checked });
  }
</script>

<div class="toolbar">
  <form class="label-form" onsubmit={setLabel}>
    <input class="field" aria-label="Label" bind:value={text} disabled={!mark} />
    <button type="submit" class="button" disabled={!mark}>Set label</button>
  </form>
  <label class="label">
    <input type="checkbox" checked={mark?.repeat ?? false} disabled={!mark} onchange={setRepeat} />
    Repeat
  </label>
  <button
    type="button"
    class="button danger"
    disabled={!mark || redactionState.applying}
    onclick={() => void redaction.applyAll()}
  >
    Redact
  </button>
  <span class="spacer"></span>
  <output class="readout">
    {redactionState.lastResult ? 'The label is part of the page now' : 'Redact to see the label'}
  </output>
</div>
