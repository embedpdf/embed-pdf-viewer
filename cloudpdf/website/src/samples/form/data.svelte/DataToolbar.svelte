<script lang="ts">
  import { untrack } from 'svelte';
  import { FormTransfer, useForm, useFormState, type FormBundle } from '@embedpdf/svelte/form';

  const form = useForm();
  const status = useFormState((formState) => formState.status);
  let bundle = $state.raw<FormBundle | null>(null);
  let result = $state('');

  // On load: the form filled in.
  let started = false;
  $effect(() => {
    if (status.current !== 'ready' || started) return;
    started = true;
    untrack(() => {
      void form.importValues({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        framework: 'Svelte',
      });
    });
  });

  async function exportFields() {
    const exported = await form.export();
    // One JSON text: what you'd store, and read back with FormTransfer.parse().
    const text = FormTransfer.stringify(exported);
    bundle = exported;
    result = `Exported ${exported.fields.length} fields, ${text.length} characters of JSON`;
  }

  async function remove() {
    for (const field of form.list()) await form.delete(field.ref);
    result = 'The form is gone';
  }

  async function importFields() {
    if (!bundle) return;
    const { fields, dropped } = await form.import(bundle);
    result = `Imported ${fields.length} fields, left out ${dropped.length}`;
  }
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={exportFields}>Export</button>
  <button type="button" class="button" onclick={remove}>Remove</button>
  <button type="button" class="button" disabled={!bundle} onclick={importFields}>Import</button>
  {#if result}<output class="readout">{result}</output>{/if}
</div>
