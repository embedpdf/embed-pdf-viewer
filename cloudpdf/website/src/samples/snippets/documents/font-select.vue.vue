<script setup lang="ts">
import { computed } from 'vue';
import { useFontsState } from '@embedpdf/vue/fonts';

const font = defineModel<string>({ required: true });
const { fonts } = useFontsState();
const choosable = computed(() => fonts.value?.fonts.filter((entry) => entry.canChoose) ?? []);
</script>

<template>
  <select v-model="font">
    <option v-for="entry in choosable" :key="entry.name" :value="entry.name">
      {{ entry.name }}
    </option>
  </select>
</template>
