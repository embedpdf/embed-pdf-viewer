<script setup lang="ts">
import { onMounted } from 'vue';
import { useCommands } from '@embedpdf/vue/commands';
import CategorySwitch from './CategorySwitch.vue';
import CommandButton from './CommandButton.vue';

const commands = useCommands();

// Run from code: the document opens with its whole first page in view.
onMounted(() => {
  void commands.execute('zoom:fit-page');
});
</script>

<template>
  <div class="toolbar">
    <div class="buttons">
      <CommandButton id="zoom:out" />
      <CommandButton id="zoom:in" />
      <CommandButton id="zoom:fit-page" />
      <CommandButton id="layout:two-pages" />
    </div>
    <div class="switches">
      <CategorySwitch category="zoom" label="Zoom" />
      <CategorySwitch category="layout" label="Layout" />
    </div>
  </div>
</template>
