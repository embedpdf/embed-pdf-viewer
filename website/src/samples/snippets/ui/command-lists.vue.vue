<script setup lang="ts">
import { commandsPlugin } from '@embedpdf/vue/commands';
import { historyCommands } from '@embedpdf/vue/history';
import { Viewer, documentCommands } from '@embedpdf/vue/runtime';
import { stageCommands } from '@embedpdf/vue/stage';
import { engine } from './pdf';

const plugins = [
  /* … */
  // Zoom, pages and rotation, undo and redo, download and print: no tools, no copy.
  commandsPlugin({ commands: [...stageCommands, ...historyCommands, ...documentCommands] }),
];
</script>

<template>
  <Viewer :engine :plugins>
    <!-- your toolbar and pages -->
  </Viewer>
</template>
