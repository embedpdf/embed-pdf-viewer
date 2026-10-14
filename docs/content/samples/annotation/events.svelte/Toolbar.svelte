<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const TOOLS = [
    { id: 'pointer', label: 'Select' },
    { id: 'square', label: 'Rectangle' },
    { id: 'ink', label: 'Pen' },
  ];

  const annotation = useAnnotation();
  const interaction = useInteraction();
  const activeToolId = useInteractionState((state) => state.activeToolId);
  const selected = useAnnotationState((state) => state.selected);
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    {#each TOOLS as tool (tool.id)}
      <button
        type="button"
        aria-pressed={activeToolId.current === tool.id}
        onclick={() => interaction.activateTool(tool.id)}
      >
        {tool.label}
      </button>
    {/each}
  </div>
  <button
    type="button"
    class="button"
    disabled={selected.current.length === 0}
    onclick={() => annotation.selection.delete()}
  >
    Delete
  </button>
</div>
