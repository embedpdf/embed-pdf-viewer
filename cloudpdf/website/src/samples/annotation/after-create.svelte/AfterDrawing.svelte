<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotation, useAnnotationSettings } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const interaction = useInteraction();
  const tools = useInteractionState();
  const afterCreate = useAnnotationSettings((settings) => settings.afterCreate);

  // The rectangle tool is active on load.
  onMount(() => {
    interaction.activateTool('square');
  });
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    aria-pressed={tools.activeToolId === 'square'}
    onclick={() => interaction.activateTool('square')}
  >
    Rectangle
  </button>
  <label class="check">
    <input
      type="checkbox"
      checked={afterCreate.current.select}
      onchange={(event) =>
        annotation.updateSettings({ afterCreate: { select: event.currentTarget.checked } })}
    />
    Select it
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={afterCreate.current.tool === 'stay'}
      onchange={(event) =>
        annotation.updateSettings({
          afterCreate: { tool: event.currentTarget.checked ? 'stay' : 'default' },
        })}
    />
    Keep the tool
  </label>
  <button type="button" class="button" onclick={() => annotation.resetSettings()}>Reset</button>
  <span class="spacer"></span>
  <output class="readout">{tools.activeToolId === 'square' ? 'Drawing' : 'Selecting'}</output>
</div>
