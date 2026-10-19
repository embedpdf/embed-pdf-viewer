<script setup lang="ts">
import { Toolbar, custom, group } from '@embedpdf/vue/toolbar';
import ToolbarButton from './ToolbarButton.vue';
import PageNumberInput from './PageNumberInput.vue';

const bar = {
  id: 'main',
  sections: {
    center: [group('page', [custom('page-number', 'page:go-to', { variants: ['full', 'compact'] })])],
  },
};
</script>

<template>
  <Toolbar :bar>
    <template #command="{ command, variant, run }">
      <ToolbarButton :command :variant @click="run()" />
    </template>
    <template #custom="{ name, variant }">
      <PageNumberInput v-if="name === 'page-number'" :compact="variant === 'compact'" />
    </template>
  </Toolbar>
</template>
