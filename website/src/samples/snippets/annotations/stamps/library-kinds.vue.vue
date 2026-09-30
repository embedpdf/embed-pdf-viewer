<script setup lang="ts">
import { useStampLibraries } from '@embedpdf/vue/stamp';

const libraries = useStampLibraries({ kind: ['stamps', 'legal-seals'] });
</script>

<template>
  <ul>
    <li v-for="library in libraries" :key="library.id">{{ library.name }}</li>
  </ul>
</template>
