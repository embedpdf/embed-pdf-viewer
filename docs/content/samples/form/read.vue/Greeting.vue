<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  toFieldRef,
  useForm,
  useFormEvent,
  useFormState,
  useFormValue,
} from '@embedpdf/vue/form';

/** On load: a name filled in. */
function useFilledInName() {
  const form = useForm();
  const status = useFormState((state) => state.status);
  let started = false;

  watch(
    status,
    (current) => {
      if (current !== 'ready' || started) return;
      started = true;
      void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
    },
    { immediate: true },
  );
}

useFilledInName();
const name = useFormValue(toFieldRef('name'));
const changed = ref<string | null>(null);

// Every change, whoever made it: typing, a script, or code.
useFormEvent(
  (form) => form.onValueChanged,
  ({ field }) => (changed.value = field.name),
);
</script>

<template>
  <div class="toolbar">
    <output class="readout">
      Hello, {{ name && 'value' in name && name.value ? name.value : 'stranger' }}
    </output>
    <output v-if="changed" class="note">Last change: {{ changed }}</output>
  </div>
</template>
