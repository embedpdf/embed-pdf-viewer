<script setup lang="ts">
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { renderPlugin } from '@embedpdf/vue/render';
import { Viewer } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { engine } from './pdf';

const plugins = [stagePlugin(), renderPlugin(), interactionPlugin()];
</script>

<template>
  <Viewer :engine :plugins>
    <!-- your toolbar and pages -->
  </Viewer>
</template>
