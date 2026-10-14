<script setup lang="ts">
import { ref, watch } from 'vue';
import { useStageState } from '@embedpdf/vue/stage';
import { useSelectionState } from '@embedpdf/vue/selection';
import { useAnnotationState } from '@embedpdf/vue/annotation';
import { useRedaction, useRedactionState } from '@embedpdf/vue/redaction';

const redaction = useRedaction();
const { pendingCount } = useRedactionState();
const { hasSelection } = useSelectionState();
const currentPage = useStageState((state) => state.currentPageIndex);
const ready = useAnnotationState((state) => state.status === 'ready');
const text = ref('EmbedPDF');

// On load: every "EmbedPDF" in the document.
let started = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || started) return;
    started = true;
    void redaction.markMatches({ text: 'EmbedPDF' });
  },
  { immediate: true },
);

function markEveryMatch() {
  if (text.value.trim()) void redaction.markMatches({ text: text.value.trim() });
}
</script>

<template>
  <div class="toolbar">
    <form class="query" @submit.prevent="markEveryMatch">
      <input v-model="text" class="field" type="search" aria-label="Text to mark" />
      <button type="submit" class="button" :disabled="!text.trim()">Every match</button>
    </form>
    <button
      type="button"
      class="button"
      :disabled="!hasSelection"
      title="Select some text on the page first"
      @click="redaction.markSelection()"
    >
      The selected text
    </button>
    <button type="button" class="button" @click="redaction.markPage(currentPage)">This page</button>
    <button
      type="button"
      class="button"
      :disabled="!pendingCount"
      @click="redaction.clearPending()"
    >
      Remove all
    </button>
    <span class="spacer" />
    <output class="readout">{{ pendingCount }} {{ pendingCount === 1 ? 'mark' : 'marks' }}</output>
  </div>
</template>
