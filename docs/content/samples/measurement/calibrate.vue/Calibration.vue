<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useInteraction } from '@embedpdf/vue/interaction';
import { useMeasurement, useMeasurementState, usePageScale } from '@embedpdf/vue/measurement';
import type { LengthUnit } from '@embedpdf/vue/measurement';

const measurement = useMeasurement();
const interaction = useInteraction();
const { calibrationRequest, busy } = useMeasurementState();
const scale = usePageScale(0);
const length = ref('20');
const unit = ref<LengthUnit>('cm');
const value = computed(() => Number(length.value));

// On load: calibrating, so the next line you drag is the known length.
let started = false;
watch(
  () => scale.value.ready,
  (ready) => {
    if (!ready || started) return;
    started = true;
    if (measurement.canCalibrate()) measurement.startCalibration();
  },
  { immediate: true },
);

// The plugin asks for the real length of the line you drew.
function setScale() {
  const request = calibrationRequest.value;
  if (!request) return;
  void measurement
    .calibrate({ ...request, distance: { value: value.value, unit: unit.value } })
    .then(() => interaction.activateTool('distance'));
}
</script>

<template>
  <form v-if="calibrationRequest" class="toolbar" @submit.prevent="setScale">
    <span class="readout">That line is</span>
    <input
      v-model="length"
      class="field length"
      type="number"
      min="0"
      step="any"
      aria-label="Its real length"
    />
    <select v-model="unit" class="field" aria-label="Unit">
      <option v-for="choice in measurement.listUnits()" :key="choice" :value="choice">
        {{ choice }}
      </option>
    </select>
    <button type="submit" class="button" :disabled="busy || !(value > 0)">Set the scale</button>
    <button type="button" class="button" @click="measurement.dismissCalibration()">Cancel</button>
  </form>
  <div v-else class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!measurement.canCalibrate()"
      @click="measurement.startCalibration()"
    >
      Calibrate
    </button>
    <output class="readout">
      Drag along something you know the length of, then measure with the new scale
    </output>
    <span class="spacer" />
    <output class="badge">
      {{ scale.measure?.subtype === 'rectilinear' ? scale.measure.ratio : '…' }}
    </output>
  </div>
</template>
