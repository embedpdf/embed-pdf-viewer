<!-- The sender picks who the next field is for and what it is for, and clicks the page. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  // A tool for each kind of value: a text box that says what it is for.
  const VALUE_TOOLS = [
    ['form-name', 'Name'],
    ['form-email', 'Email'],
    ['form-organization', 'Organization'],
    ['form-organization-title', 'Title'],
    ['form-date-signed', 'Date signed'],
  ] as const;

  const form = useForm();
  const interaction = useInteraction();
  const formState = useFormState();
  const interactionState = useInteractionState();

  // Start by placing name fields for the first signer.
  onMount(() => {
    form.setDesignGroup('borrower');
    interaction.activateTool('form-name');
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
  {#each VALUE_TOOLS as [id, label] (id)}
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
