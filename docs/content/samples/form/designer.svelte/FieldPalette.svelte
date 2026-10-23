<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  const FIELD_TOOLS = [
    ['form-text', 'Text'],
    ['form-checkbox', 'Checkbox'],
    ['form-radio', 'Radio button'],
    ['form-combobox', 'Dropdown'],
    ['form-listbox', 'List'],
    ['form-signature', 'Signature'],
  ] as const;

  const interaction = useInteraction();
  const interactionState = useInteractionState();
  const form = useForm();
  const formState = useFormState();
  // The pointer fills the form in; every other tool here designs it.
  const filling = $derived(interactionState.activeToolId === 'pointer');

  // Start with the text tool picked: the printed form has boxes, but no fields yet.
  onMount(() => {
    interaction.activateTool('form-text');
  });
</script>

{#if !form.canDesign()}
  <p class="readout">This document's form can't be changed.</p>
{:else}
  <div class="toolbar">
    <div class="segments">
      <button
        type="button"
        class="segment"
        aria-pressed={filling}
        onclick={() => interaction.activateTool('pointer')}
      >
        Fill in
      </button>
      <button
        type="button"
        class="segment"
        aria-pressed={!filling}
        onclick={() => interaction.activateTool('form-edit')}
      >
        Design
      </button>
    </div>
    {#each FIELD_TOOLS as [id, label] (id)}
      <button
        type="button"
        class="button"
        aria-pressed={interactionState.activeToolId === id}
        onclick={() => interaction.activateTool(id)}
      >
        {label}
      </button>
    {/each}
    <output class="readout">
      {formState.fields.length} fields: click the page to place another
    </output>
  </div>
{/if}
