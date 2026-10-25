<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useRedaction, useRedactionState } from '@embedpdf/svelte/redaction';

  // The cover's subtitle, in page coordinates.
  const SUBTITLE = { x: 44, y: 318, width: 206, height: 50 };

  const interaction = useInteraction();
  const activeToolId = useInteractionState((state) => state.activeToolId);
  const stage = useStage();
  const redaction = useRedaction();
  const redactionState = useRedactionState();
  const ready = useAnnotationState((state) => state.status === 'ready');

  // On load: the cover's subtitle marked, and the redact tool on.
  let started = false;
  $effect(() => {
    if (!ready.current || started) return;
    started = true;
    untrack(() => {
      void redaction.markArea(0, SUBTITLE).then(() => stage.reveal(0, { rect: SUBTITLE }));
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
