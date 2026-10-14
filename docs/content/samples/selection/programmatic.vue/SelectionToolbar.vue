<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection, useSelectionState } from '@embedpdf/vue/selection';

// On the cover: the characters of its title, and a point on its word "Viewers", in page coordinates.
const TITLE = { start: 10, count: 52 };
const POINT = { x: 260, y: 242 };

// Every button selects on the cover, the first page: by its ref, or by its index, 0.
const selection = useSelection();
const { hasSelection, range, pages } = useSelectionState();
const pageList = usePageList();
const cover = computed(() => pageList.value[0]?.ref);

// The title is selected on load.
watch(
  cover,
  (page) => {
    if (page) selection.select({ page, ...TITLE });
  },
  { immediate: true },
);

function selectTitle() {
  if (cover.value) selection.select({ page: cover.value, ...TITLE });
}

const summary = computed(() => {
  if (pages.value.length > 1) return `On ${pages.value.length} pages`;
  if (range.value) return `${range.value.end.index - range.value.start.index} characters`;
  return 'Nothing selected';
});
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!selection.canSelect() || !cover"
      @click="selectTitle"
    >
      Title
    </button>
    <button
      type="button"
      class="button"
      :disabled="!selection.canSelect()"
      @click="selection.selectWordAt(0, POINT)"
    >
      Word
    </button>
    <button
      type="button"
      class="button"
      :disabled="!selection.canSelect()"
      @click="selection.selectLineAt(0, POINT)"
    >
      Line
    </button>
    <button
      type="button"
      class="button"
      :disabled="!selection.canSelect()"
      @click="selection.selectPage(0)"
    >
      Page
    </button>
    <button
      type="button"
      class="button"
      :disabled="!selection.canSelect()"
      @click="selection.selectAll()"
    >
      Everything
    </button>
    <button type="button" class="button" :disabled="!hasSelection" @click="selection.clear()">
      Clear
    </button>
    <output class="badge">{{ summary }}</output>
  </div>
</template>
