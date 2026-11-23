<script lang="ts">
  import { useForm, useFormState } from '@embedpdf/svelte/form';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const FIELD_TOOLS = [
    ['form-text', 'Text'],
    ['form-checkbox', 'Checkbox'],
    ['form-signature', 'Signature'],
  ] as const;

  const form = useForm();
  const formState = useFormState();
  const interaction = useInteraction();
  const interactionState = useInteractionState();
</script>

{#each formState.groups as group (group.id)}
  <button
    aria-pressed={formState.designGroup === group.id}
    disabled={!form.canSetGroup(group.id)}
    onclick={() => form.setDesignGroup(group.id)}
  >
    <i style:background={group.color}></i>
    {group.label ?? group.id}
  </button>
{/each}

{#each FIELD_TOOLS as [id, label] (id)}
  <button
    aria-pressed={interactionState.activeToolId === id}
    onclick={() => interaction.activateTool(id)}
  >
    {label}
  </button>
{/each}
