<script setup lang="ts">
import { ref } from 'vue';
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const { currentPageIndex, pageCount } = useStageState();
const typed = ref('');

// People count from 1, an index from 0. An index past the end goes to the last page.
function jump() {
  const number = Number(typed.value);
  if (Number.isInteger(number) && number >= 1) stage.goToPage(number - 1);
  typed.value = '';
}
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!stage.canGoPrevious()"
      @click="stage.previousPage()"
    >
      ‹ Previous
    </button>
    <output class="badge">
      Page <strong>{{ currentPageIndex + 1 }} / {{ pageCount }}</strong>
    </output>
    <button type="button" class="button" :disabled="!stage.canGoNext()" @click="stage.nextPage()">
      Next ›
    </button>
    <input
      v-model="typed"
      class="field"
      inputmode="numeric"
      aria-label="Go to page"
      placeholder="Go to page…"
      @keydown.enter="jump"
    />
  </div>
</template>
