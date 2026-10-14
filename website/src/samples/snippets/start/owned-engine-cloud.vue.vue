<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import { cloudEngine } from '@cloudpdf/engine';
import { plugins } from './pdf';
</script>

<template>
  <Viewer :engine="() => cloudEngine({ baseUrl: 'https://pdf.example.com' })" :plugins="plugins" />
</template>
