<script lang="ts" module>
  const LABELS: Record<string, string> = {
    pointer: 'Select',
    pan: 'Hand',
    zoom: 'Zoom',
    snapshot: 'Snapshot',
  };
  const HINTS: Record<string, string> = {
    pointer: 'A drag selects text',
    pan: 'A drag scrolls the pages',
    zoom: 'A drag zooms to the box, a click zooms in',
    snapshot: 'A drag takes part of a page as an image',
  };
</script>

<!-- A button for every tool you can switch to, the active one pressed. -->
<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const interaction = useInteraction();
  const state = useInteractionState();
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    {#each state.tools as tool (tool.id)}
      <button
        type="button"
        class="segment"
        aria-pressed={tool.id === state.activeToolId}
        onclick={() => interaction.activateTool(tool.id)}
      >
        {LABELS[tool.id] ?? tool.id}
      </button>
    {/each}
  </div>
  <output class="readout">{state.activeToolId ? HINTS[state.activeToolId] : ''}</output>
</div>
