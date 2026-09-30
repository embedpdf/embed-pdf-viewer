<script setup lang="ts">
import type { AnnotationRef } from '@embedpdf/vue/annotation';
import { useMeasurementReadout } from '@embedpdf/vue/measurement';

const { annotation } = defineProps<{ annotation: AnnotationRef }>();

const readout = useMeasurementReadout(() => annotation);
// { kind: 'distance', value: 3.42, label: '3.42 m' }
</script>

<template>
  <span>{{ 'unavailable' in readout ? '—' : readout.label }}</span>
</template>
