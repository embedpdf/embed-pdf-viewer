<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { toFieldRef, useForm, useFormState, type FormValidation } from '@embedpdf/svelte/form';

  const form = useForm();
  const stage = useStage();
  const status = useFormState((formState) => formState.status);
  let check = $state.raw<FormValidation | null>(null);

  // Check the required fields, and take the reader to the first empty one.
  function submit() {
    const result = form.validate();
    check = result;
    // Where a field shows is its widget's row in the form.
    const first = result.missing[0]?.widgets[0];
    const widget = first ? form.getWidget(first) : null;
    if (widget) stage.reveal(widget.page, { rect: widget.rect });
  }

  // Fill in a name, then check the form, as if it was submitted.
  let started = false;
  $effect(() => {
    if (status.current !== 'ready' || started) return;
    started = true;
    untrack(() => {
      void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }).then(submit);
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
