<script setup lang="ts">
import { ref, watch } from 'vue';
import { useMeasurement, useMeasurementState, usePageScale } from '@embedpdf/vue/measurement';
import type { AreaUnit, LengthUnit } from '@embedpdf/vue/measurement';

// Precision is steps per unit: 100 shows two decimals.
const PRECISIONS = [1, 10, 100, 1000];

const measurement = useMeasurement();
const { busy } = useMeasurementState();
const scale = usePageScale(0);
const preset = ref('metric-100');
const unit = ref<LengthUnit>('m');
const areaUnit = ref<AreaUnit>('m2');
const precision = ref(100);

// Every change recalculates the measurements already on the page.
watch(preset, (id) => void measurement.setPreset(0, id));
watch(unit, (next) => void measurement.setUnit(0, next));
watch(areaUnit, (next) => void measurement.setAreaUnit(0, next));
watch(precision, (next) => void measurement.setPrecision(0, next));
</script>

<template>
  <div class="toolbar">
    <label class="label">
      Scale
      <select v-model="preset" class="field" :disabled="busy">
        <option v-for="choice in measurement.listPresets()" :key="choice.id" :value="choice.id">
          {{ choice.label }}
        </option>
      </select>
    </label>
    <label class="label">
      Length
      <select v-model="unit" class="field" :disabled="busy">
        <option v-for="choice in measurement.listUnits()" :key="choice" :value="choice">
          {{ choice }}
        </option>
      </select>
    </label>
    <label class="label">
      Area
      <select v-model="areaUnit" class="field" :disabled="busy">
        <option v-for="choice in measurement.listAreaUnits()" :key="choice" :value="choice">
          {{ choice }}
        </option>
      </select>
    </label>
    <label class="label">
      Steps
      <select v-model="precision" class="field" :disabled="busy">
        <option v-for="choice in PRECISIONS" :key="choice" :value="choice">
          {{ choice === 1 ? 'Whole' : `1/${choice}` }}
        </option>
      </select>
    </label>
    <span class="spacer" />
    <output class="badge">
      {{ scale.measure?.subtype === 'rectilinear' ? scale.measure.ratio : '…' }}
    </output>
  </div>
</template>
