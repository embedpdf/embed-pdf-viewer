<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

  const form = useForm();
  const stage = useStage();
  const formState = useFormState();
  const pages = usePageList();

  // The ebook has no form, so this adds one to its last page when it opens, and goes there.
  let added = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (formState.status !== 'ready' || !page || added) return;
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
      stage.goToPage(page);
    });
  });
</script>

<div class="toolbar">
  <output class="readout">
    {formState.fields.length === 0
      ? 'Adding a form…'
      : `${formState.fields.length} fields: click one and fill it in`}
  </output>
</div>
