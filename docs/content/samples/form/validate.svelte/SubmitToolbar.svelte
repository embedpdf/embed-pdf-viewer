<script lang="ts">
  import { untrack } from 'svelte';
  import { toFieldRef, useForm, useFormState, type FormValidation } from '@embedpdf/svelte/form';

  const form = useForm();
  const status = useFormState((formState) => formState.status);
  let check = $state.raw<FormValidation | null>(null);

  // Check the required fields.
  function validate() {
    const result = form.validate();
    check = result;
    return result;
  }

  // Submit: check, and put the cursor in the first empty field.
  function submit() {
    const first = validate().missing[0];
    if (first) form.focus(first.ref);
  }

  // Fill in a name, then check the form, as if it was submitted.
  let started = false;
  $effect(() => {
    if (status.current !== 'ready' || started) return;
    started = true;
    untrack(() => {
      void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }).then(validate);
    });
  });
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={submit}>Submit</button>
  {#if check}
    {#if check.valid}
      <output class="readout">Every required field is filled in</output>
    {:else}
      <output class="readout missing">
        Fill in first: {check.missing.map((field) => field.name).join(', ')}
      </output>
    {/if}
  {/if}
</div>
