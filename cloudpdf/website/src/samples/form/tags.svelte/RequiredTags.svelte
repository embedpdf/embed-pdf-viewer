<script lang="ts">
  import { useForm, useFormState } from '@embedpdf/svelte/form';
  import Tag from './Tag.svelte';

  const form = useForm();
  const formState = useFormState();

  // A tag on every required field that is still empty.
  const missing = $derived.by(() => {
    void formState.fields; // again when a field is filled in
    return form.validate().missing;
  });
</script>

{#each missing as field (field.name)}
  <Tag {field} />
{/each}
