<!-- The selected text becomes a mark, one per page; the selection is cleared afterwards. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection, useSelectionState } from '@embedpdf/vue/selection';
import { useAnnotation } from '@embedpdf/vue/annotation';

// On the cover: the characters of the title's first line.
const FIRST_LINE = { start: 10, count: 17 };

const MARKUP = [
  { tool: 'highlight', label: 'Highlight' },
  { tool: 'underline', label: 'Underline' },
  { tool: 'strikeout', label: 'Strike out' },
  { tool: 'squiggly', label: 'Squiggly' },
];

const annotation = useAnnotation();
const selection = useSelection();
const { hasSelection } = useSelectionState();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);
const status = ref('');

// On load: the title's first line is selected, ready to mark.
watch(
  cover,
  (page) => {
    if (page) selection.select({ page, ...FIRST_LINE });
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
