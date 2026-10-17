<script setup lang="ts">
import { useMeasurement, useMeasurementState } from '@embedpdf/vue/measurement';

import LengthPrompt from './LengthPrompt.vue';

const measurement = useMeasurement();
const { calibrationRequest } = useMeasurementState();

function apply(value: number) {
  const request = calibrationRequest.value;
  if (request) measurement.calibrate({ ...request, distance: { value, unit: 'cm' } });
}
</script>

<template>
  <LengthPrompt
    v-if="calibrationRequest"
    @submit="apply"
    @cancel="measurement.dismissCalibration()"
  />
</template>
