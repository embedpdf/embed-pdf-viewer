<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm, useFormSettings } from '@embedpdf/vue/form';

const COLORS = [
  ['Accent', null],
  ['Orange', '#ea580c'],
  ['Green', '#16a34a'],
] as const;

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
