<script setup lang="ts">
import { onMounted } from 'vue';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { SelectionLayer } from '@embedpdf/vue/selection';
import { useShell } from '@embedpdf/vue/shell';
import ViewMenu from './ViewMenu.vue';

const shell = useShell();

// The menu and its submenu are open when the document is.
onMounted(() => {
  shell.openMenu('view');
  shell.openMenu('view-tool');
});
</script>

<template>
  <ViewMenu />
  <Stage class="stage">
    <template #page>
      <RenderLayer />
      <SelectionLayer />
    </template>
  </Stage>
</template>
