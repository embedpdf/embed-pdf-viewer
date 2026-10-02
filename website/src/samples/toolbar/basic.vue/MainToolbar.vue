<script setup lang="ts">
import { Toolbar, group, item } from '@embedpdf/vue/toolbar';
import type { BarSchema } from '@embedpdf/vue/toolbar';

// Your icons, by the names the standard commands give them.
const ICONS: Record<string, string> = {
  'previous-page': '‹',
  'next-page': '›',
  'zoom-out': '−',
  'zoom-in': '+',
  'fit-width': '↔',
  pointer: '↖',
  pan: '✥',
  highlight: '▍',
  underline: 'U̲',
  ink: '〰',
  download: '↓',
  print: '⎙',
};

const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('pages', ['page:previous', 'page:next'])],
    center: [
      group('zoom', [
        'zoom:out',
        item('zoom:in', { variants: ['icon+label', 'icon'] }),
        item('zoom:fit-width', { variants: ['icon+label', 'icon'], importance: 2 }),
      ]),
    ],
    end: [
      group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight', 'tool:underline', 'tool:ink'], {
        collapse: 'menu',
      }),
      group('document', [item('document:download', { importance: 5 }), 'document:print']),
    ],
  },
};
</script>

<template>
  <Toolbar :bar="bar" class="toolbar">
    <template #command="{ command, variant, run }">
      <button
        type="button"
        class="button"
        :title="command.label"
        :aria-label="command.label"
        :disabled="!command.enabled"
        :aria-pressed="command.active"
        @click="run()"
      >
        <span class="icon" aria-hidden="true">
          {{ ICONS[command.icon ?? ''] ?? command.label.charAt(0) }}
        </span>
        <span v-if="variant === 'icon+label'">{{ command.label }}</span>
      </button>
    </template>
  </Toolbar>
</template>
