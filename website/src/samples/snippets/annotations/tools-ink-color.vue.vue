<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotation, useAnnotationDefaults } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const defaults = useAnnotationDefaults('ink');

const color = computed({
  get: () => defaults.value.color,
  set: (color) => annotation.tools.updateDefaults('ink', { color }),
});
</script>

<template>
  <input v-model="color" type="color" />
</template>
