<script setup lang="ts">
import { useAnnotationList } from '@embedpdf/vue/annotation';

const highlights = useAnnotationList({ subtype: 'highlight' });
</script>

<template>
  <p>{{ highlights.length }} highlights</p>
</template>
