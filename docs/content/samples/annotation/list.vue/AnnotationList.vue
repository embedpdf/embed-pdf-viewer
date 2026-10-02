<!-- The annotations of one kind, in drawing order. A click shows one on its page. -->
<script setup lang="ts">
import { shallowRef } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { annotationKey, useAnnotation, useAnnotationList } from '@embedpdf/vue/annotation';
import type { Annotation, AnnotationSubtype } from '@embedpdf/vue/annotation';

const KINDS: { label: string; subtype?: AnnotationSubtype }[] = [
  { label: 'All' },
  { label: 'Highlights', subtype: 'highlight' },
  { label: 'Notes', subtype: 'text' },
  { label: 'Rectangles', subtype: 'square' },
];

const kind = shallowRef(KINDS[0]!);
const annotations = useAnnotationList(() =>
  kind.value.subtype ? { subtype: kind.value.subtype } : undefined,
);
const pages = usePageList();
const stage = useStage();
const annotation = useAnnotation();

const pageNumberOf = (objectNumber: number) =>
  pages.value.findIndex((page) => page.ref.objectNumber === objectNumber) + 1;

// What it is, and where: "highlight · page 2".
const kindOf = (each: Annotation) =>
  `${each.subtype} · page ${pageNumberOf(each.page.objectNumber)}`;

function show(each: Annotation) {
  stage.reveal(each.page, { rect: each.rect });
  annotation.selection.set([each.ref]);
}
</script>

<template>
  <div class="panel">
    <div class="segmented" role="group" aria-label="Kind">
      <button
        v-for="each in KINDS"
        :key="each.label"
        type="button"
        :aria-pressed="each === kind"
        @click="kind = each"
      >
        {{ each.label }}
      </button>
    </div>
    <p class="count">{{ annotations.length }} found</p>
    <ul class="items">
      <li v-for="each in annotations" :key="annotationKey(each.ref)">
        <button type="button" class="item" @click="show(each)">
          <span class="kind">{{ kindOf(each) }}</span>
          <span>{{ each.contents ?? '—' }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
