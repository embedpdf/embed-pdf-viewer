<script setup lang="ts">
import { ref } from 'vue';
import { useMeasurementEvent } from '@embedpdf/vue/measurement';

const message = ref('');

useMeasurementEvent(
  (measurement) => measurement.onScaleChanged,
  () => (message.value = 'The scale changed'),
);
</script>

<template>
  <p aria-live="polite">{{ message }}</p>
</template>
