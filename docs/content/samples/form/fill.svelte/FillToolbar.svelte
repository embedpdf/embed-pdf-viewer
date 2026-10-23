<script lang="ts">
  import { toFieldRef, useForm, type FormCapability } from '@embedpdf/svelte/form';

  /** One field of each family, with `setValue()` in the shape each one takes. */
  async function fillIn(form: FormCapability) {
    await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }); // text
    await form.setValue(toFieldRef('updates'), { checked: true }); // checkbox
    await form.setValue(toFieldRef('plan'), { value: 'yearly' }); // radio group: a button's value
    await form.setValue(toFieldRef('framework'), { value: 'React' }); // dropdown: an option's value
    return form.setValue(toFieldRef('topics'), { selectedValues: ['Forms', 'Signatures'] }); // list
  }

  const form = useForm();
  let result = $state('');

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
