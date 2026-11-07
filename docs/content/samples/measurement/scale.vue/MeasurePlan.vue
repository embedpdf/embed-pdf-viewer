<!-- On load: a distance and an area on the floor plan, at 1:100, scrolled into view. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useMeasurement, usePageScale } from '@embedpdf/vue/measurement';

// The floor plan's lower half, where the measurements go.
const LOWER_HALF = { x: 50, y: 500, width: 512, height: 240 };

const measurement = useMeasurement();
const stage = useStage();
const scale = usePageScale(0);

let started = false;
watch(
  () => scale.value.ready,
  (ready) => {
    if (!ready || started) return;
    started = true;
    void measurement.setPreset(0, 'metric-100').then(() =>
      Promise.all([
        measurement.createMeasurement({
          kind: 'distance',
          page: 0,
          points: [
            { x: 62, y: 723 },
            { x: 550, y: 723 },
          ],
        }),
        measurement.createMeasurement({
          kind: 'area',
          page: 0,
          points: [
            { x: 382, y: 516 },
            { x: 550, y: 516 },
            { x: 550, y: 723 },
            { x: 382, y: 723 },
          ],
        }),
      ]).then(() => stage.reveal(0, { rect: LOWER_HALF })),
    );
  },
  { immediate: true },
);
</script>

<template></template>
