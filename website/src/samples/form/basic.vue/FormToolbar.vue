<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useFormState } from '@embedpdf/vue/form';

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
const { fields } = useFormState();
</script>

<template>
  <div class="toolbar">
    <output class="readout">{{ fields.length }} fields: click one and fill it in</output>
  </div>
</template>
