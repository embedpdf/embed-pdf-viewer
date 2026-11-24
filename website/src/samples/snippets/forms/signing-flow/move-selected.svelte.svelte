<script lang="ts">
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  const form = useForm();
  const formState = useFormState();

  const give = (groupId: string) =>
    form.moveToGroup(
      formState.selectedFields.map((field) => field.ref),
      groupId,
    );
</script>

{#if formState.selectedFields.length > 0}
  Give to
  {#each formState.groups as group (group.id)}
    <button disabled={!form.canSetGroup(group.id)} onclick={() => give(group.id)}>
      <i style:background={group.color}></i>
      {group.label ?? group.id}
    </button>
  {/each}
{/if}
