<script lang="ts">
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, type FormCapability, type FormFieldDTO } from '@embedpdf/svelte/form';

  // The printed boxes are the fields' look: a new field only sets its text size.
  const look = { fontSize: 11 };

  // The printed table of group tickets: a row every 36 points from the top at 470, with a country
  // box at x 96 and a circle for each ticket at x 330 and 430.
  const rowTop = (row: number) => 470 + row * 36;

  /** A dropdown in a row's country box. */
  function addDropdown(form: FormCapability, page: PageRef, row: number) {
    return form.create({
      family: 'combobox',
      name: `country_${row + 1}`,
      options: [
        { label: 'Netherlands', value: 'NL' },
        { label: 'Belgium', value: 'BE' },
        { label: 'Germany', value: 'DE' },
      ],
      widgets: [{ page, rect: { x: 96, y: rowTop(row), width: 160, height: 24 }, ...look }],
    });
  }

  /** A radio group in a row's two circles: one field, a widget per circle, each with its value. */
  function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
    const y = rowTop(row) + 4;
    return form.create({
      family: 'radio',
      name: `ticket_${row + 1}`,
      widgets: [
        { page, rect: { x: 330, y, width: 16, height: 16 }, exportValue: 'one-day', ...look },
        { page, rect: { x: 430, y, width: 16, height: 16 }, exportValue: 'both-days', ...look },
      ],
    });
  }

  const form = useForm();
  const stage = useStage();
  const pages = usePageList();
  const page = $derived(pages.current[0]?.ref); // the printed form
  let added = $state.raw<FormFieldDTO[]>([]);

  // Each kind of field fills its column from the top: the next row that hasn't got one.
  function rowFor(family: FormFieldDTO['family']) {
    return added.filter((field) => field.family === family).length;
  }

  async function add(addField: typeof addDropdown, family: FormFieldDTO['family']) {
    if (!page) return;
    const { field } = await addField(form, page, rowFor(family));
    added = [...added, field];
    stage.reveal(page, { rect: form.getWidget(field.widgets[0])!.rect });
  }

  async function removeLast() {
    const field = added.at(-1);
    if (!field) return;
    await form.delete(field.ref);
    added = added.slice(0, -1);
  }

  const lastField = $derived(added.at(-1));
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!page || rowFor('combobox') >= 5}
    onclick={() => void add(addDropdown, 'combobox')}
  >
    Add a dropdown
  </button>
  <button
    type="button"
    class="button"
    disabled={!page || rowFor('radio') >= 5}
    onclick={() => void add(addRadioGroup, 'radio')}
  >
    Add a radio group
  </button>
  <button type="button" class="button" disabled={!lastField} onclick={removeLast}>
    Remove the last
  </button>
  <output class="readout">
    {added.map((field) => field.name).join(', ') || 'No fields in the table yet'}
  </output>
</div>
