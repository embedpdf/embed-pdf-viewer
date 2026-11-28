<!-- The sender picks who the next field is for, then a tool, and clicks the page. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useForm, useFormState } from '@embedpdf/svelte/form';
  import { ANYONE } from './people';

  const FIELD_TOOLS = [
    ['form-text', 'Text'],
    ['form-checkbox', 'Checkbox'],
    ['form-signature', 'Signature'],
    ['form-initials', 'Initials'],
  ] as const;

  const form = useForm();
  const interaction = useInteraction();
  const formState = useFormState();
  const interactionState = useInteractionState();

  // One signer signs a signature field, so it's never for anyone: the tool places nothing then.
  const forAnyone = $derived(formState.designAssignment.kind === 'anyone');

  function placeForAnyone() {
    form.setDesignAssignment({ kind: 'anyone' });
    if (interactionState.activeToolId === 'form-signature') interaction.activateTool('form-text');
  }

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
  <button
    type="button"
    class="button"
    aria-pressed={forAnyone}
    disabled={!form.canAssign({ kind: 'anyone' })}
    onclick={placeForAnyone}
  >
    <i class="swatch" style:background={ANYONE}></i>Anyone
  </button>
  <span class="divider"></span>
  {#each FIELD_TOOLS as [id, label] (id)}
    <button
      type="button"
      class="button"
      aria-pressed={interactionState.activeToolId === id}
      disabled={forAnyone && id === 'form-signature'}
      onclick={() => interaction.activateTool(id)}
    >
      {label}
    </button>
  {/each}
</div>
