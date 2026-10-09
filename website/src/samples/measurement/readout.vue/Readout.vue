<!-- One measurement's readout: a click selects it on the page. -->
<script setup lang="ts">
import { useAnnotation } from '@embedpdf/vue/annotation';
import type { Annotation } from '@embedpdf/vue/annotation';
import { useMeasurementReadout } from '@embedpdf/vue/measurement';

const { annotation } = defineProps<{ annotation: Annotation }>();

const readout = useMeasurementReadout(() => annotation.ref);
const annotations = useAnnotation();
</script>

<template>
  <li>
    <button type="button" class="row" @click="annotations.selection.set([annotation.ref])">
      <span class="kind">{{ 'unavailable' in readout ? 'No scale' : readout.kind }}</span>
      <span class="value">{{ 'unavailable' in readout ? '—' : readout.label }}</span>
    </button>
  </li>
</template>
