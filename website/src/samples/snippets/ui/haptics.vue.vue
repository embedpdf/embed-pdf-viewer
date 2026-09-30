<script setup lang="ts">
import { feedbackPlugin, interactionPlugin, vibrationFeedback } from '@embedpdf/vue/interaction';
import { Viewer } from '@embedpdf/vue/runtime';
import { engine } from './pdf';

const plugins = [/* … */ interactionPlugin(), feedbackPlugin({ provider: vibrationFeedback })];
</script>

<template>
  <Viewer :engine :plugins>
    <!-- your toolbar and pages -->
  </Viewer>
</template>
