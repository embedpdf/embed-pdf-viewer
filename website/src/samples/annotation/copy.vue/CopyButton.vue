<!-- A read passed to create() makes the same annotation again, here on the next page. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const stage = useStage();
const pages = usePageList();
const { selected } = useAnnotationState();
const status = ref('');
const first = computed(() => selected.value[0]);
const next = computed(() => {
  const wanted = first.value;
  const index = wanted
    ? pages.value.findIndex((page) => page.ref.objectNumber === wanted.page.objectNumber)
    : -1;
  return pages.value[index + 1];
});

async function copyToNextPage() {
  const source = first.value;
  const target = next.value;
  if (!source || !target) return;
  const copy = annotation.get(source.ref)!;
  const { annotation: made } = await annotation.create(target.ref, copy, undefined, {
    select: true, // so the next click copies the copy, a page further
  });
  stage.reveal(target.ref, { rect: made.rect });
  status.value = `Copied to page ${target.index + 1}`;
}
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="selected.length !== 1 || !next"
      @click="copyToNextPage"
    >
      Copy to the next page
    </button>
    <span class="spacer" />
    <output class="readout">
      {{ status || (first ? 'Ready to copy' : 'Select an annotation to copy') }}
    </output>
  </div>
</template>
