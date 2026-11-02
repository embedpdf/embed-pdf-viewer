<script setup lang="ts">
import { ref, watch } from 'vue';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import type { FormValidation } from '@embedpdf/vue/form';

/** Fill in a name, then check the form, as if it was submitted. */
function useFilledInName(onReady: () => void) {
  const form = useForm();
  const status = useFormState((state) => state.status);
  let started = false;

  watch(
    status,
    (current) => {
      if (current !== 'ready' || started) return;
      started = true;
      void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }).then(onReady);
    },
    { immediate: true },
  );
}

const form = useForm();
const check = ref<FormValidation | null>(null);

// Check the required fields.
function validate() {
  const result = form.validate();
  check.value = result;
  return result;
}
useFilledInName(validate);

// Submit: check, and put the cursor in the first empty field.
function submit() {
  const first = validate().missing[0];
  if (first) form.focus(first.ref);
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="submit">Submit</button>
    <template v-if="check">
      <output v-if="check.valid" class="readout">Every required field is filled in</output>
      <output v-else class="readout missing">
        Fill in first: {{ check.missing.map((field) => field.name).join(', ') }}
      </output>
    </template>
  </div>
</template>
