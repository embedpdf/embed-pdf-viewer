<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { FormTransfer, useForm, useFormState, type FormBundle } from '@embedpdf/vue/form';

/** Start on the sign-up page, filled in. */
function useStartOnSignUp() {
  const form = useForm();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const pages = usePageList();
  const signUp = computed(() => pages.value[1]?.ref);
  let started = false;

  watch(
    [status, signUp],
    ([current, page]) => {
      if (current !== 'ready' || !page || started) return;
      started = true;
      stage.goToPage(page);
      void form.importValues({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        framework: 'Svelte',
      });
    },
    { immediate: true },
  );
}

useStartOnSignUp();
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
