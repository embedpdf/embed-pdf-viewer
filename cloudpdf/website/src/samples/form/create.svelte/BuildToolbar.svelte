<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, useFormState, type FormCapability } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

  /** A dropdown, the next row down the page. */
  function addDropdown(form: FormCapability, page: PageRef, row: number) {
    return form.create({
      family: 'combobox',
      name: `country_${row + 1}`,
      options: [
        { label: 'Netherlands', value: 'NL' },
        { label: 'Belgium', value: 'BE' },
      ],
      widgets: [{ page, rect: { x: 72, y: 520 + row * 36, width: 160, height: 24 }, ...look }],
    });
  }

  /** A radio group: one field with a widget per button, each with the value it stands for. */
  function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
    const y = 524 + row * 36;
    return form.create({
      family: 'radio',
      name: `plan_${row + 1}`,
      widgets: [
        { page, rect: { x: 72, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
        { page, rect: { x: 112, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
      ],
    });
  }

  const form = useForm();
  const stage = useStage();
  const formState = useFormState();
  const pages = usePageList();
  const page = $derived(pages.current.at(-1)?.ref);

  // The ebook has no form: start with a dropdown on its last page, which has room.
  let added = false;
  $effect(() => {
    const last = page;
    if (formState.status !== 'ready' || !last || added) return;
    added = true;
    untrack(() => {
      void addDropdown(form, last, 0).then(({ field }) =>
        stage.reveal(last, { rect: field.widgets[0].rect }),
      );
    });
  });

  // Each new field goes a row further down the page: bring it into view.
  function add(addField: typeof addDropdown) {
    const last = page;
    if (!last) return;
    void addField(form, last, formState.fields.length).then(({ field }) =>
      stage.reveal(last, { rect: field.widgets[0].rect }),
    );
  }

  const lastField = $derived(formState.fields.at(-1));
  const full = $derived(formState.fields.length >= 5);
</script>

<div class="toolbar">
  <button type="button" class="button" disabled={!page || full} onclick={() => add(addDropdown)}>
    Add a dropdown
  </button>
  <button type="button" class="button" disabled={!page || full} onclick={() => add(addRadioGroup)}>
    Add a radio group
  </button>
  <button
    type="button"
    class="button"
    disabled={!lastField}
    onclick={() => lastField && void form.delete(lastField.ref)}
  >
    Remove the last
  </button>
  <output class="readout">
    {formState.fields.map((field) => field.name).join(', ') || 'No fields'}
  </output>
</div>
