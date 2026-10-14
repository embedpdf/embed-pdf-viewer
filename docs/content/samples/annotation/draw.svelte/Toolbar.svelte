<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotationList } from '@embedpdf/svelte/annotation';

  const TOOLS = [
    { id: 'pointer', label: 'Select' },
    { id: 'square', label: 'Rectangle' },
    { id: 'ink', label: 'Pen' },
    { id: 'highlight', label: 'Highlight' },
    { id: 'note', label: 'Note' },
  ];

  const interaction = useInteraction();
  const tools = useInteractionState();
  const annotations = useAnnotationList();
  const count = $derived(annotations.current.length);

  // The rectangle tool is active on load: drag on the page to draw one.
  onMount(() => {
    interaction.activateTool('square');
  });
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    {#each TOOLS as tool (tool.id)}
      <button
        type="button"
        aria-pressed={tools.activeToolId === tool.id}
        onclick={() => interaction.activateTool(tool.id)}
      >
        {tool.label}
      </button>
    {/each}
  </div>
  <output class="readout">
    {count}
    {count === 1 ? 'annotation' : 'annotations'}
  </output>
</div>
