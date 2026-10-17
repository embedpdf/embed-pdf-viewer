<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm, useFormSettings, useFormState } from '@embedpdf/vue/form';

const COLORS = [
  ['Accent', null],
  ['Orange', '#ea580c'],
  ['Green', '#16a34a'],
] as const;

/** The ebook has no form, so this adds one to its last page: fields with no border of their own. */
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
        await form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), fontSize: 11 }] });
        await form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), fontSize: 11 }] });
        await form.create({ family: 'checkbox', name: 'updates', widgets: [at(614, 16, 16)] });
        stage.goToPage(page);
      })();
    },
    { immediate: true },
  );
}

useSignUpForm();
const form = useForm();
const { fields, focus } = useFormSettings();
</script>

<template>
  <div class="toolbar">
    <span class="label">Edges</span>
    <div class="segments">
      <button
        v-for="[label, color] in COLORS"
        :key="label"
        type="button"
        class="segment"
        :aria-pressed="fields.border === color"
        @click="form.updateSettings({ fields: { border: color } })"
      >
        {{ label }}
      </button>
    </div>
    <span class="label">Focus</span>
    <div class="segments">
      <button
        v-for="[label, color] in COLORS"
        :key="label"
        type="button"
        class="segment"
        :aria-pressed="focus.color === color"
        @click="form.updateSettings({ focus: { color } })"
      >
        {{ label }}
      </button>
    </div>
  </div>
</template>
