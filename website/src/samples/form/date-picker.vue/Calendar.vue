<!-- A month of days. `shown` is the day the field holds, when it holds one. -->
<script setup lang="ts">
import { ref } from 'vue';
import type { DatePartsInput } from '@embedpdf/vue/form';
import { daysOf, today } from './days';

const props = defineProps<{ shown: DatePartsInput | null }>();
const emit = defineEmits<{ pick: [day: DatePartsInput] }>();

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const start = props.shown ?? today();
const year = ref(start.year);
const month = ref(start.month);

const turn = (by: number) => {
  const next = new Date(year.value, month.value - 1 + by, 1);
  year.value = next.getFullYear();
  month.value = next.getMonth() + 1;
};
</script>

<template>
  <div class="calendar" role="group" aria-label="Pick a date">
    <div class="calendar-bar">
      <button type="button" class="calendar-turn" aria-label="Month before" @click="turn(-1)">
        ‹
      </button>
      <span class="calendar-month">{{ MONTHS[month - 1] }} {{ year }}</span>
      <button type="button" class="calendar-turn" aria-label="Month after" @click="turn(1)">
        ›
      </button>
    </div>
    <div class="calendar-days">
      <template v-for="(day, at) in daysOf(year, month)" :key="at">
        <span v-if="day === null" />
        <button
          v-else
          type="button"
          class="calendar-day"
          :aria-pressed="shown?.year === year && shown.month === month && shown.day === day"
          @click="emit('pick', { year, month, day })"
        >
          {{ day }}
        </button>
      </template>
    </div>
  </div>
</template>
