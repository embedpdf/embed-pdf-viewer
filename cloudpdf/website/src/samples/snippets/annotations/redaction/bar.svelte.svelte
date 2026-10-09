<script lang="ts">
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import { useRedaction, useRedactionState } from '@embedpdf/svelte/redaction';

  const interaction = useInteraction();
  const redaction = useRedaction();
  const state = useRedactionState();
</script>

<button onclick={() => interaction.activateTool('redact')}>Mark for redaction</button>
<button disabled={!state.pendingCount || state.applying} onclick={() => redaction.applyAll()}>
  Redact {state.pendingCount} marks
</button>
