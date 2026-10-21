<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, type FormCapability, type FormFieldDTO } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#ffffff', strokeWidth: 1, fontSize: 11 };

  /** A dropdown, the next row down the page. */
  function addDropdown(form: FormCapability, page: PageRef, row: number) {
    return form.create({
      family: 'combobox',
      name: `country_${row + 1}`,
      options: [
        { label: 'Netherlands', value: 'NL' },
        { label: 'Belgium', value: 'BE' },
      ],
      widgets: [{ page, rect: { x: 96, y: 270 + row * 36, width: 160, height: 24 }, ...look }],
    });
  }

  /** A radio group: one field with a widget per button, each with the value it stands for. */
  function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
    const y = 274 + row * 36;
    return form.create({
      family: 'radio',
      name: `plan_${row + 1}`,
      widgets: [
        { page, rect: { x: 96, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
        { page, rect: { x: 136, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
      ],
    });
  }

  const form = useForm();
  const stage = useStage();
  const pages = usePageList();
  // The form's last page is empty: room for new fields.
  const page = $derived(pages.current.at(-1)?.ref);
  let added = $state.raw<FormFieldDTO[]>([]);

  let started = false;
  $effect(() => {
    const last = page;
    if (!last || started) return;
    started = true;
    untrack(() => stage.goToPage(last));
  });

  // Each new field goes a row further down the page: bring it into view.
  async function add(addField: typeof addDropdown) {
    const last = page;
    if (!last) return;
    const { field } = await addField(form, last, added.length);
    added = [...added, field];
    stage.reveal(last, { rect: form.getWidget(field.widgets[0])!.rect });
  }

  async function removeLast() {
    const field = added.at(-1);
    if (!field) return;
    await form.delete(field.ref);
    added = added.slice(0, -1);
  }

  const lastField = $derived(added.at(-1));
  const full = $derived(added.length >= 5);
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!page || full}
    onclick={() => void add(addDropdown)}
  >
    Add a dropdown
  </button>
  <button
    type="button"
    class="button"
    disabled={!page || full}
    onclick={() => void add(addRadioGroup)}
  >
    Add a radio group
  </button>
  <button type="button" class="button" disabled={!lastField} onclick={removeLast}>
    Remove the last
  </button>
  <output class="readout">
    {added.map((field) => field.name).join(', ') || 'No fields on this page yet'}
  </output>
</div>
