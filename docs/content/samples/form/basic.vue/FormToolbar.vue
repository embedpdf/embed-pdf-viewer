<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm, useFormState } from '@embedpdf/vue/form';

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** The ebook has no form, so this adds one to its last page when it opens, and goes there. */
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
        stage.goToPage(page);
      })();
    },
    { immediate: true },
  );
}

useSignUpForm();
const { fields } = useFormState();
</script>

<template>
  <div class="toolbar">
    <output class="readout">
      {{
        fields.length === 0 ? 'Adding a form…' : `${fields.length} fields: click one and fill it in`
      }}
    </output>
  </div>
</template>
