<!-- On load: the cover at 1:50, and one measurement of each kind on it, scrolled into view. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useMeasurement, usePageScale } from '@embedpdf/vue/measurement';

// The cover's empty lower half, where the measurements go.
const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

const measurement = useMeasurement();
const stage = useStage();
const scale = usePageScale(0);

let started = false;
watch(
  () => scale.value.ready,
  (ready) => {
    if (!ready || started) return;
    started = true;
    void measurement.setPreset(0, 'metric-50').then(() =>
      Promise.all([
        measurement.createMeasurement({
          kind: 'distance',
          page: 0,
          points: [
            { x: 60, y: 740 },
            { x: 550, y: 740 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'perimeter',
          page: 0,
          points: [
            { x: 60, y: 580 },
            { x: 160, y: 640 },
            { x: 260, y: 590 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'area',
          page: 0,
          points: [
            { x: 80, y: 650 },
            { x: 250, y: 650 },
            { x: 250, y: 710 },
            { x: 80, y: 710 },
          ],
        }),
      ]).then(() => stage.reveal(0, { rect: LOWER_HALF })),
    );
  },
  { immediate: true },
);
</script>

<template></template>
