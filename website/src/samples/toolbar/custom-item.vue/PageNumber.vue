<script setup lang="ts">
import { ref } from 'vue';
import { useStage, useStageState } from '@embedpdf/vue/stage';

// The item itself: "Page 3 of 120", or "3 / 120" when there's less room.
defineProps<{ compact: boolean }>();

const stage = useStage();
const { currentPageIndex, pageCount } = useStageState();
const typed = ref<string | null>(null);

function onFocus(event: FocusEvent) {
  (event.target as HTMLInputElement).select();
}

function onInput(event: Event) {
  typed.value = (event.target as HTMLInputElement).value;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  const number = Number(typed.value);
  if (Number.isInteger(number) && number >= 1) stage.goToPage(number - 1);
  typed.value = null;
}
</script>

<template>
  <label class="page-number">
    <template v-if="!compact">Page</template>
    <input
      class="page-input"
      inputmode="numeric"
      aria-label="Page number"
      :value="typed ?? String(currentPageIndex + 1)"
      @focus="onFocus"
      @input="onInput"
      @blur="typed = null"
      @keydown="onKeyDown"
    />
    {{ compact ? `/ ${pageCount}` : `of ${pageCount}` }}
  </label>
</template>
