<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import type { FormCapability } from '@embedpdf/vue/form';

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

/** The ebook has no form, so this adds one to its last page, fills it in, and goes there. */
function useSignUpForm() {
  const form = useForm();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const pages = usePageList();
  const lastPage = computed(() => pages.value.at(-1)?.ref);
  let added = false;

  watch(
    [status, lastPage],
    ([current, page]) => {
      if (current !== 'ready' || !page || added) return;
      added = true;
      const at = (x: number, y: number, width: number, height: number) => ({
        page,
        rect: { x, y, width, height },
        ...look,
      });
      void (async () => {
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
      })();
    },
    { immediate: true },
  );
}

useSignUpForm();
const form = useForm();
const result = ref('');

async function fill() {
  const { status } = await fillIn(form);
  result.value = `Filled in: ${status}`;
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
  result.value = `${applied.length} filled, ${skipped.length} skipped`;
}

async function reset() {
  const { fields } = await form.reset();
  result.value = `${fields.length} fields reset`;
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="fill">Fill in</button>
    <button type="button" class="button" @click="fillFromBackend">Fill from your backend</button>
    <button type="button" class="button" @click="reset">Reset</button>
    <output v-if="result" class="readout">{{ result }}</output>
  </div>
</template>
