<script setup lang="ts">
import { useCommands, useCommandsSettings } from '@embedpdf/vue/commands';

// Turning a category off hides its commands wherever they appear.
const props = defineProps<{ category: string; label: string }>();
const commands = useCommands();
const off = useCommandsSettings((settings) => settings.disabledCategories.includes(props.category));

function onChange(event: Event) {
  if ((event.target as HTMLInputElement).checked) commands.enableCategory(props.category);
  else commands.disableCategory(props.category);
}
</script>

<template>
  <label class="switch">
    <input type="checkbox" :checked="!off" @change="onChange" />
    {{ label }}
  </label>
</template>
