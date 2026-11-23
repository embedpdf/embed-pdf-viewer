<!-- A signer sees whose field is whose: theirs stand out, and the others take no input. -->
<script lang="ts">
  import { useFormState } from '@embedpdf/svelte/form';
  import { people, type Person } from './people';

  let { person }: { person: Person } = $props();

  const formState = useFormState();
</script>

<div class="toolbar">
  {#each formState.groups as group (group.id)}
    {@const count = formState.fields.filter((field) => field.groupId === group.id).length}
    <span class="legend">
      <i class="swatch" style:background={group.color}></i>
      {group.label ?? group.id}: {count}
    </span>
  {/each}
  <output class="readout">{people[person].name} fills in the fields in their color</output>
</div>
