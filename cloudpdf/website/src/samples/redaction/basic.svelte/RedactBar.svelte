<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useRedaction, useRedactionState } from '@embedpdf/svelte/redaction';

  // The author's name on the cover, in page coordinates.
  const AUTHOR = { x: 100, y: 508, width: 172, height: 50 };

  const interaction = useInteraction();
  const activeToolId = useInteractionState((state) => state.activeToolId);
  const stage = useStage();
  const redaction = useRedaction();
  const redactionState = useRedactionState();
  const ready = useAnnotationState((state) => state.status === 'ready');

  // On load: the author's name marked, and the redact tool on.
  let started = false;
  $effect(() => {
    if (!ready.current || started) return;
    started = true;
    untrack(() => {
      void redaction.markArea(0, AUTHOR).then(() => stage.reveal(0, { rect: AUTHOR }));
      interaction.activateTool('redact');
    });
  });

  const marking = $derived(activeToolId.current === 'redact');
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    aria-pressed={marking}
    onclick={() => interaction.activateTool(marking ? 'pointer' : 'redact')}
  >
    Mark for redaction
  </button>
  <button
    type="button"
    class="button danger"
    disabled={!redactionState.pendingCount || redactionState.applying}
    onclick={() => void redaction.applyAll()}
  >
    Redact {redactionState.pendingCount}
    {redactionState.pendingCount === 1 ? 'mark' : 'marks'}
  </button>
  <span class="spacer"></span>
  <output class="readout">
    {marking ? 'Select text, or drag over an area' : 'Click a mark to move it'}
  </output>
</div>
