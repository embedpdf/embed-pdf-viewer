<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const TOOLS = [
    { id: 'note', label: 'Note' },
    { id: 'square', label: 'Rectangle' },
  ];

  let { opacity = $bindable() }: { opacity: number | null } = $props();

  const interaction = useInteraction();
  const tools = useInteractionState();

  // The note tool is active on load: move the pointer over the page.
  onMount(() => {
    interaction.activateTool('note');
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
  <label class="range">
    From CSS
    <input
      type="range"
      min={0.1}
      max={0.9}
      step={0.1}
      value={opacity ?? 0.5}
      oninput={(event) => (opacity = Number(event.currentTarget.value))}
    />
    <output class="readout">
      {opacity === null ? "each tool's own" : `${Math.round(opacity * 100)}%`}
    </output>
  </label>
  <button type="button" class="button" disabled={opacity === null} onclick={() => (opacity = null)}>
    Reset
  </button>
</div>
