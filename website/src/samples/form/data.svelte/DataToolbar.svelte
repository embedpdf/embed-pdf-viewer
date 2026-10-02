<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

  const form = useForm();
  const stage = useStage();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  let xfdf = $state.raw<Uint8Array | null>(null);
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

  async function exportData() {
    const { bytes } = await form.export(); // XFDF; form.export('fdf') for FDF
    xfdf = bytes;
    result = `Exported ${bytes.byteLength} bytes of XFDF`;
  }

  async function clear() {
    await form.reset();
    result = 'The form is empty';
  }

  async function importData() {
    if (!xfdf) return;
    const { applied } = await form.import(xfdf);
    result = `Imported ${applied} values`;
  }
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={exportData}>Export</button>
  <button type="button" class="button" onclick={clear}>Clear</button>
  <button type="button" class="button" disabled={!xfdf} onclick={importData}>Import</button>
  {#if result}<output class="readout">{result}</output>{/if}
</div>
