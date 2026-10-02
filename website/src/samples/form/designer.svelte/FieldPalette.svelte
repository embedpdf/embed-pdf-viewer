<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
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
  const stage = useStage();
  const pages = usePageList();
  // The pointer fills the form in; every other tool here designs it.
  const filling = $derived(interactionState.activeToolId === 'pointer');

  // Start on the ebook's last page, which has room for a form, with the text tool picked.
  let started = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (!page || started) return;
    started = true;
    untrack(() => {
      stage.goToPage(page);
      interaction.activateTool('form-text');
    });
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
      {formState.fields.length === 0
        ? 'Click the page to place a field'
        : `${formState.fields.length} fields`}
    </output>
  </div>
{/if}
