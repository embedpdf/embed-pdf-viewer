<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { FormTransfer, useForm, useFormState, type FormBundle } from '@embedpdf/svelte/form';

  const form = useForm();
  const stage = useStage();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  let bundle = $state.raw<FormBundle | null>(null);
  let result = $state('');

  // Start on the sign-up page, filled in.
  let started = false;
  $effect(() => {
    const page = pages.current[1]?.ref;
    if (status.current !== 'ready' || !page || started) return;
    started = true;
    untrack(() => {
      stage.goToPage(page);
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
