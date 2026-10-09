<script setup lang="ts">
import { computed } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// The top half of the cover, where the box selects.
const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

const annotation = useAnnotation();
const { selected } = useAnnotationState(); // the selected annotations
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

function selectAll() {
  if (cover.value) annotation.selection.selectAll(cover.value);
}

function selectTopHalf() {
  if (cover.value) annotation.selection.selectInRect(cover.value, TOP_HALF);
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!cover" @click="selectAll">
      Everything on the cover
    </button>
    <button type="button" class="button" :disabled="!cover" @click="selectTopHalf">
      The top half
    </button>
    <button
      type="button"
      class="button"
      :disabled="selected.length === 0"
      @click="annotation.selection.clear()"
    >
      Clear
    </button>
    <span class="spacer" />
    <output class="readout">{{ selected.length }} selected</output>
  </div>
</template>
