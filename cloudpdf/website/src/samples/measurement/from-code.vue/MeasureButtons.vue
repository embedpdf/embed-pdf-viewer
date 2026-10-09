<script setup lang="ts">
import { computed, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotationList } from '@embedpdf/vue/annotation';
import { useMeasurement, usePageScale } from '@embedpdf/vue/measurement';
import type { MeasurementKind } from '@embedpdf/vue/measurement';

// Points on the cover's empty lower half, in page coordinates: two for a
// distance, the corners otherwise.
const SHAPES: Record<MeasurementKind, { x: number; y: number }[]> = {
  distance: [
    { x: 60, y: 750 },
    { x: 550, y: 750 },
  ],
  perimeter: [
    { x: 70, y: 600 },
    { x: 150, y: 650 },
    { x: 250, y: 600 },
  ],
  area: [
    { x: 70, y: 670 },
    { x: 250, y: 670 },
    { x: 250, y: 730 },
    { x: 70, y: 730 },
  ],
};

// The cover's empty lower half, where the measurements go.
const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

const measurement = useMeasurement();
const stage = useStage();
const scale = usePageScale(0);
const onCover = useAnnotationList({ pages: [0] });
const count = computed(
  () =>
    onCover.value.filter(
      (annotation) => 'intent' in annotation && !!annotation.intent?.endsWith('-dimension'),
    ).length,
);

// The same measurement the tool makes, with the page's scale and the tool's style.
function measure(kind: MeasurementKind) {
  void measurement.createMeasurement({ kind, page: 0, points: SHAPES[kind] });
}

// On load: an area, scrolled into view.
let started = false;
watch(
  () => scale.value.ready,
  (ready) => {
    if (!ready || started) return;
    started = true;
    void measurement
      .createMeasurement({ kind: 'area', page: 0, points: SHAPES.area })
      .then(() => stage.reveal(0, { rect: LOWER_HALF }));
  },
  { immediate: true },
);
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!scale.ready" @click="measure('distance')">
      Distance
    </button>
    <button type="button" class="button" :disabled="!scale.ready" @click="measure('perimeter')">
      Perimeter
    </button>
    <button type="button" class="button" :disabled="!scale.ready" @click="measure('area')">
      Area
    </button>
    <span class="spacer" />
    <output class="readout">
      {{ count }} {{ count === 1 ? 'measurement' : 'measurements' }} on the cover
    </output>
  </div>
</template>
