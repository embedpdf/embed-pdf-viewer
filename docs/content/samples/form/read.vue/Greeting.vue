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

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** The ebook has no form, so this adds one to its last page, fills in a name, and goes there. */
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
        await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
        stage.goToPage(page);
      })();
    },
    { immediate: true },
  );
}

useSignUpForm();
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
