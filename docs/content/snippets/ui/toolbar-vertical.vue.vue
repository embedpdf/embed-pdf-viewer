<script setup lang="ts">
import { Toolbar, group } from '@embedpdf/vue/toolbar';
import Icon from './Icon.vue';

const rail = {
  id: 'rail',
  sections: {
    start: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'])],
    end: [group('zoom', ['zoom:in', 'zoom:out'])],
  },
};
</script>

<template>
  <Toolbar :bar="rail" orientation="vertical" aria-label="Tools" style="height: 100%">
    <template #command="{ command, run }">
      <button
        :disabled="!command.enabled"
        :aria-pressed="command.active"
        :title="command.label"
        @click="run()"
      >
        <Icon :name="command.icon" />
      </button>
    </template>
  </Toolbar>
</template>
