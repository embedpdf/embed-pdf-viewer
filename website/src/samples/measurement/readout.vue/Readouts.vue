<script setup lang="ts">
import { computed } from 'vue';
import { annotationKey, useAnnotationList } from '@embedpdf/vue/annotation';
import type { Annotation } from '@embedpdf/vue/annotation';
import Readout from './Readout.vue';

// A measurement is a line, polyline or polygon with a dimension intent.
const isMeasurement = (annotation: Annotation) =>
  'intent' in annotation && !!annotation.intent?.endsWith('-dimension');

const onCover = useAnnotationList({ pages: [0] });
const measurements = computed(() => onCover.value.filter(isMeasurement));
</script>

<template>
  <ul class="readouts" aria-label="Measurements on the cover">
    <Readout
      v-for="annotation in measurements"
      :key="annotationKey(annotation.ref)"
      :annotation="annotation"
    />
  </ul>
</template>
