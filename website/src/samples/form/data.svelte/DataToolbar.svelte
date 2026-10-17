<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { FormTransfer, useForm, useFormState, type FormBundle } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

  const form = useForm();
  const stage = useStage();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  let bundle = $state.raw<FormBundle | null>(null);
  let result = $state('');

  // The ebook has no form, so this adds one to its last page, fills it in, and goes there.
  let added = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (status.current !== 'ready' || !page || added) return;
    added = true;
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    untrack(async () => {
      await form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), ...look }] });
      await form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), ...look }] });
      await form.create({
        family: 'combobox',
        name: 'framework',
        options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
        widgets: [{ ...at(612, 160), ...look }],
      });
      await form.create({ family: 'checkbox', name: 'updates', widgets: [{ ...at(650, 16, 16), ...look }] });
      await form.importValues({ name: 'Ada Lovelace', email: 'ada@example.com', framework: 'Svelte' });
      stage.goToPage(page);
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
