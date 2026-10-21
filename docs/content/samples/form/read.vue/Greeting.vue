<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import {
  toFieldRef,
  useForm,
  useFormEvent,
  useFormState,
  useFormValue,
} from '@embedpdf/vue/form';

/** Start on the sign-up page, with a name filled in. */
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
      void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
    },
    { immediate: true },
  );
}

useStartOnSignUp();
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
