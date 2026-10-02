<script setup lang="ts">
import { useAnnotationState } from '@embedpdf/vue/annotation';

const { selected } = useAnnotationState(); // the selected annotations
</script>

<template>
  <p>{{ selected.length }} selected</p>
</template>
