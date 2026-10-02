<script lang="ts">
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  const form = useForm();
  const state = useFormState();
</script>

{#if state.selectedField}
  {@const field = state.selectedField}
  <input value={field.name} onblur={(e) => form.update(field.ref, { name: e.currentTarget.value })} />
  <label>
    <input
      type="checkbox"
      checked={field.required}
      onchange={(e) => form.update(field.ref, { required: e.currentTarget.checked })}
    />
    Required
  </label>
{/if}
