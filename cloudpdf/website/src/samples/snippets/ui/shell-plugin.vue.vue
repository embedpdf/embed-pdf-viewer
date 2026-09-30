<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import { shellPlugin } from '@embedpdf/vue/shell';
import { engine } from './pdf';

const plugins = [/* … */ shellPlugin()];
</script>

<template>
  <Viewer :engine :plugins>
    <!-- your toolbar, panels and pages -->
  </Viewer>
</template>
