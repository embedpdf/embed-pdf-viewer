<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { FormTransfer, useForm, useFormState, type FormBundle } from '@embedpdf/vue/form';

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

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
      const at = (y: number, width = 240, height = 24) => ({
        page,
        rect: { x: 72, y, width, height },
      });
      void (async () => {
        await form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), ...look }] });
        await form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), ...look }] });
        await form.create({
          family: 'combobox',
          name: 'framework',
          options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
          widgets: [{ ...at(612, 160), ...look }],
        });
        await form.create({
          family: 'checkbox',
          name: 'updates',
          widgets: [{ ...at(650, 16, 16), ...look }],
        });
        await form.importValues({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          framework: 'Svelte',
        });
        stage.goToPage(page);
      })();
    },
    { immediate: true },
  );
}

useSignUpForm();
const form = useForm();
const bundle = shallowRef<FormBundle | null>(null);
const result = ref('');

async function exportFields() {
  const exported = await form.export();
  // One JSON text: what you'd store, and read back with FormTransfer.parse().
  const text = FormTransfer.stringify(exported);
  bundle.value = exported;
  result.value = `Exported ${exported.fields.length} fields, ${text.length} characters of JSON`;
}

async function remove() {
  for (const field of form.list()) await form.delete(field.ref);
  result.value = 'The form is gone';
}

async function importFields() {
  if (!bundle.value) return;
  const { fields, dropped } = await form.import(bundle.value);
  result.value = `Imported ${fields.length} fields, left out ${dropped.length}`;
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="exportFields">Export</button>
    <button type="button" class="button" @click="remove">Remove</button>
    <button type="button" class="button" :disabled="!bundle" @click="importFields">Import</button>
    <output v-if="result" class="readout">{{ result }}</output>
  </div>
</template>
