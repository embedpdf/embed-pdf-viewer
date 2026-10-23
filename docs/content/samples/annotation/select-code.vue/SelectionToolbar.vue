<script setup lang="ts">
import { computed } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// The top half of a page, where the box selects: on the home page, the image and the button.
const TOP_HALF = { x: 0, y: 0, width: 612, height: 396 };

const annotation = useAnnotation();
const { selected } = useAnnotationState(); // the selected annotations
const pages = usePageList();
const page = computed(() => pages.value[0]?.ref); // the home page wireframe

function selectAll() {
  if (page.value) annotation.selection.selectAll(page.value);
}

function selectTopHalf() {
  if (page.value) annotation.selection.selectInRect(page.value, TOP_HALF);
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!page" @click="selectAll">
      Everything on the page
    </button>
    <button type="button" class="button" :disabled="!page" @click="selectTopHalf">
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
