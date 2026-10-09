<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { toFieldRef, useForm, useFormState, type FormCapability } from '@embedpdf/svelte/form';

  // How the new fields look: part of the PDF, like the rest of the page.
  const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

  /** One field of each family, with `setValue()` in the shape each one takes. */
  async function fillIn(form: FormCapability) {
    await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }); // text
    await form.setValue(toFieldRef('updates'), { checked: true }); // checkbox
    await form.setValue(toFieldRef('plan'), { value: 'yearly' }); // radio group: a button's value
    await form.setValue(toFieldRef('framework'), { value: 'React' }); // dropdown: an option's value
    return form.setValue(toFieldRef('topics'), { selectedValues: ['Forms', 'Signatures'] }); // list
  }

  const form = useForm();
  const stage = useStage();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  let result = $state('');

  // The ebook has no form, so this adds one to its last page, fills it in, and goes there.
  let added = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (status.current !== 'ready' || !page || added) return;
    added = true;
    const at = (x: number, y: number, width: number, height: number) => ({
      page,
      rect: { x, y, width, height },
      ...look,
    });
    untrack(async () => {
      await form.create({ family: 'text', name: 'name', widgets: [at(72, 520, 220, 22)] });
      await form.create({
        family: 'combobox',
        name: 'framework',
        options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
        widgets: [at(72, 552, 160, 22)],
      });
      await form.create({
        family: 'radio',
        name: 'plan',
        widgets: [
          { ...at(72, 588, 16, 16), exportValue: 'monthly' },
          { ...at(112, 588, 16, 16), exportValue: 'yearly' },
        ],
      });
      await form.create({ family: 'checkbox', name: 'updates', widgets: [at(72, 618, 16, 16)] });
      await form.create({
        family: 'listbox',
        name: 'topics',
        multiSelect: true,
        options: ['Forms', 'Annotations', 'Signatures'].map((label) => ({ label, value: label })),
        widgets: [at(320, 520, 150, 60)],
      });
      await fillIn(form);
      stage.goToPage(page);
    });
  });

  async function fill() {
    const { status } = await fillIn(form);
    result = `Filled in: ${status}`;
  }

  async function fillFromBackend() {
    // Plain values by full name, as your backend would send them.
    const { applied, skipped } = await form.importValues({
      name: 'Grace Hopper',
      framework: 'Vue',
      updates: false,
      topics: ['Annotations'],
      phone: '555-0100',
    });
    result = `${applied.length} filled, ${skipped.length} skipped`;
  }

  async function reset() {
    const { fields } = await form.reset();
    result = `${fields.length} fields reset`;
  }
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={fill}>Fill in</button>
  <button type="button" class="button" onclick={fillFromBackend}>Fill from your backend</button>
  <button type="button" class="button" onclick={reset}>Reset</button>
  {#if result}<output class="readout">{result}</output>{/if}
</div>
