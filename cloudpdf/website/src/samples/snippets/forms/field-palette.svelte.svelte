<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const FIELD_TOOLS = [
    ['form-text', 'Text'],
    ['form-checkbox', 'Checkbox'],
    ['form-radio', 'Radio button'],
    ['form-combobox', 'Dropdown'],
    ['form-listbox', 'List'],
    ['form-signature', 'Signature'],
  ] as const;

  const interaction = useInteraction();
  const state = useInteractionState();
</script>

{#each FIELD_TOOLS as [id, label] (id)}
  <button aria-pressed={state.activeToolId === id} onclick={() => interaction.activateTool(id)}>
    {label}
  </button>
{/each}
