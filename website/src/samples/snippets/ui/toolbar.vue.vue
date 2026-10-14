<script setup lang="ts">
import { Toolbar, group, item } from '@embedpdf/vue/toolbar';
import Icon from './Icon.vue';

const bar = {
  id: 'main',
  sections: {
    start: [group('navigation', ['page:previous', 'page:next'])],
    center: [group('zoom', ['zoom:out', item('zoom:in', { variants: ['icon+label', 'icon'] })])],
    end: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'], { collapse: 'menu' })],
  },
};
</script>

<template>
  <Toolbar :bar>
    <template #command="{ command, variant, run }">
      <button
        :disabled="!command.enabled"
        :aria-pressed="command.active"
        :title="command.label"
        @click="run()"
      >
        <Icon :name="command.icon" />
        <template v-if="variant === 'icon+label'">{{ command.label }}</template>
      </button>
    </template>
  </Toolbar>
</template>
