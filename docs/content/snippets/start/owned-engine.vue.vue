<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import { localEngine } from '@embedpdf/engine';
import { plugins } from './pdf';
</script>

<template>
  <Viewer :engine="() => localEngine()" :plugins="plugins" />
</template>
