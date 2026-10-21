<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useForm } from '@embedpdf/vue/form';
import type { FormCapability } from '@embedpdf/vue/form';

/** One field of each family, with `setValue()` in the shape each one takes. */
async function fillIn(form: FormCapability) {
  await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }); // text
  await form.setValue(toFieldRef('updates'), { checked: true }); // checkbox
  await form.setValue(toFieldRef('plan'), { value: 'yearly' }); // radio group: a button's value
  await form.setValue(toFieldRef('framework'), { value: 'React' }); // dropdown: an option's value
  return form.setValue(toFieldRef('topics'), { selectedValues: ['Forms', 'Signatures'] }); // list
}

/** Start on the sign-up page, the form's first fields. */
function useStartOnSignUp() {
  const stage = useStage();
  const pages = usePageList();
  const signUp = computed(() => pages.value[1]?.ref);
  let started = false;

  watch(
    signUp,
    (page) => {
      if (!page || started) return;
      started = true;
      stage.goToPage(page);
    },
    { immediate: true },
  );
}

useStartOnSignUp();
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
