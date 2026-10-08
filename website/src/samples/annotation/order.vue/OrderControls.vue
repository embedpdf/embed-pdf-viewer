<!-- The last annotation on a page is drawn on top. -->
<script setup lang="ts">
import { computed } from 'vue';
import {
  annotationKey,
  useAnnotation,
  useAnnotationList,
  useAnnotationState,
} from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const { selected } = useAnnotationState();
const first = computed(() => selected.value[0]);
const onPage = useAnnotationList(() => (first.value ? { pages: [first.value.page] } : undefined));
const position = computed(() => {
  const wanted = first.value;
  if (!wanted) return -1;
  return onPage.value.findIndex((each) => annotationKey(each.ref) === annotationKey(wanted.ref));
});

function sendToBack() {
  if (first.value) void annotation.reorder([first.value.ref], 'start');
}

function bringToFront() {
  if (first.value) void annotation.reorder([first.value.ref], 'end');
}
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!first || selected.length !== 1"
      @click="sendToBack"
    >
      Send to back
    </button>
    <button
      type="button"
      class="button"
      :disabled="!first || selected.length !== 1"
      @click="bringToFront"
    >
      Bring to front
    </button>
    <span class="spacer" />
    <output class="readout">
      {{
        position >= 0 ? `${position + 1} of ${onPage.length}, from the back` : 'Select a rectangle'
      }}
    </output>
  </div>
</template>
