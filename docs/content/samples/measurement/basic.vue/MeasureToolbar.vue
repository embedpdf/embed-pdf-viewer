<script setup lang="ts">
import { watch } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useMeasurement, usePageScale } from '@embedpdf/vue/measurement';

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'distance', label: 'Distance' },
  { id: 'perimeter', label: 'Perimeter' },
  { id: 'area', label: 'Area' },
];

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const measurement = useMeasurement();
const scale = usePageScale(0); // the cover's scale

// On load: the cover at 1:100, its width measured along the top, and the distance tool on.
let started = false;
watch(
  () => scale.value.ready,
  (ready) => {
    if (!ready || started) return;
    started = true;
    void measurement
      .setPreset(0, 'metric-100')
      .then(() =>
        measurement.createMeasurement({
          kind: 'distance',
          page: 0,
          points: [
            { x: 30, y: 28 },
            { x: 582, y: 28 },
          ],
        }),
      )
      .then(() => interaction.activateTool('distance'));
  },
  { immediate: true },
);
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Tool">
      <button
        v-for="tool in TOOLS"
        :key="tool.id"
        type="button"
        :aria-pressed="activeToolId === tool.id"
        @click="interaction.activateTool(tool.id)"
      >
        {{ tool.label }}
      </button>
    </div>
    <span class="spacer" />
    <output class="badge">
      Scale {{ scale.measure?.subtype === 'rectilinear' ? scale.measure.ratio : '…' }}
    </output>
  </div>
</template>
