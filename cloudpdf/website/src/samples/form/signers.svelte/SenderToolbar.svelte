<!-- The sender picks who the next field is for, then a tool, and clicks the page. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  const FIELD_TOOLS = [
    ['form-text', 'Text'],
    ['form-checkbox', 'Checkbox'],
    ['form-signature', 'Signature'],
  ] as const;

  const form = useForm();
  const interaction = useInteraction();
  const formState = useFormState();
  const interactionState = useInteractionState();

  // Start by placing text fields for the first signer.
  onMount(() => {
    form.setDesignGroup('borrower');
    interaction.activateTool('form-text');
  });
</script>

<div class="toolbar">
  <span class="label">Next field is for</span>
  {#each formState.groups as group (group.id)}
    <button
      type="button"
      class="button"
      aria-pressed={formState.designGroup === group.id}
      disabled={!form.canSetGroup(group.id)}
      onclick={() => form.setDesignGroup(group.id)}
    >
      <i class="swatch" style:background={group.color}></i>{group.label ?? group.id}
    </button>
  {/each}
  <span class="divider"></span>
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
</div>
