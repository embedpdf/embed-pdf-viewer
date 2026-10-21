<!-- The selected text becomes a mark, one per page; the selection is cleared afterwards. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useSelection, useSelectionState } from '@embedpdf/vue/selection';
import { useAnnotation } from '@embedpdf/vue/annotation';

// On page 2: the characters of the sentence in its “Your turn” box, and where it is.
const SENTENCE = { start: 605, count: 44 };
const SENTENCE_BOX = { x: 68, y: 446, width: 256, height: 16 };

const MARKUP = [
  { tool: 'highlight', label: 'Highlight' },
  { tool: 'underline', label: 'Underline' },
  { tool: 'strikeout', label: 'Strike out' },
  { tool: 'squiggly', label: 'Squiggly' },
];

const annotation = useAnnotation();
const selection = useSelection();
const { hasSelection } = useSelectionState();
const stage = useStage();
const pages = usePageList();
const page = computed(() => pages.value[1]?.ref);
const status = ref('');

// On load: the sentence is selected, ready to mark, and in view.
watch(
  page,
  (current) => {
    if (!current) return;
    selection.select({ page: current, ...SENTENCE });
    stage.reveal(current, { rect: SENTENCE_BOX });
  },
  { immediate: true },
);

async function mark(tool: string, label: string) {
  const { annotations } = await annotation.createFromSelection(tool);
  status.value = `${label}: ${annotations.length} made`;
}
</script>

<template>
  <div class="toolbar">
    <button
      v-for="{ tool, label } in MARKUP"
      :key="tool"
      type="button"
      class="button"
      :disabled="!hasSelection"
      @click="mark(tool, label)"
    >
      {{ label }}
    </button>
    <span class="spacer" />
    <output class="readout">{{ hasSelection ? 'Text selected' : status || 'Select text' }}</output>
  </div>
</template>
