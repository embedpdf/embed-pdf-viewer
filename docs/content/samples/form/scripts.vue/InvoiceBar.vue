<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useFormEvent, useFormValue } from '@embedpdf/vue/form';

/** Start on the invoice: its amounts and its total are calculated by scripts. */
function useStartOnInvoice() {
  const stage = useStage();
  const pages = usePageList();
  const invoice = computed(() => pages.value[3]?.ref);
  let started = false;

  watch(
    invoice,
    (page) => {
      if (!page || started) return;
      started = true;
      stage.goToPage(page);
    },
    { immediate: true },
  );
}

useStartOnInvoice();
const total = useFormValue(toFieldRef('invoice.total'));
const refused = ref<string | null>(null);

// A script refused a value, such as a date that isn't day/month/year.
useFormEvent(
  (form) => form.onValidationRejected,
  ({ field, issues }) => (refused.value = `${field.name}: ${issues[0]?.message ?? 'refused'}`),
);
</script>

<template>
  <div class="toolbar">
    <output class="readout">
      Total: {{ total && 'value' in total && total.value ? total.value : 'type a quantity' }}
    </output>
    <output v-if="refused" class="refused">{{ refused }}</output>
  </div>
</template>
