<script setup lang="ts">
import { AnnotationToken } from '@embedpdf/vue/annotation';
import { commandsPlugin, standardCommands } from '@embedpdf/vue/commands';
import { DocumentsToken, Viewer } from '@embedpdf/vue/runtime';
import { engine } from './pdf';
import { approveDocument } from './review';

const plugins = [
  /* … */
  commandsPlugin({
    commands: [
      ...standardCommands,
      {
        id: 'review:approve',
        label: 'Approve',
        icon: 'check',
        shortcut: 'Mod+Enter',
        enabled: ({ get }) => get(AnnotationToken).canCreate(),
        run: ({ get }) => approveDocument(get(DocumentsToken)),
      },
    ],
  }),
];
</script>

<template>
  <Viewer :engine :plugins>
    <!-- your toolbar and pages -->
  </Viewer>
</template>
