<!-- The toolbar is always mounted, so it gives the stamp and attachment tools their file dialog. -->
<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useFilePickerProvider } from '@embedpdf/svelte/annotation';

  const TOOLS = [
    { id: 'pointer', label: 'Select' },
    { id: 'stamp', label: 'Stamp' },
    { id: 'attachment', label: 'Attach a file' },
  ];

  useFilePickerProvider();
  const interaction = useInteraction();
  const tools = useInteractionState();
</script>

<div class="toolbar" role="toolbar">
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
  <p class="hint">
    {#if tools.activeToolId === 'stamp'}
      Click the page, then pick a PNG or a JPEG
    {:else if tools.activeToolId === 'attachment'}
      Click the page, then pick any file
    {/if}
  </p>
</div>
