<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useInteraction } from '@embedpdf/vue/interaction';

const interaction = useInteraction();

function down(event: KeyboardEvent) {
  if (event.code === 'Space' && !event.repeat) interaction.pushTool('pan');
}
function up(event: KeyboardEvent) {
  if (event.code === 'Space') interaction.popTool();
}

onMounted(() => {
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
});
onUnmounted(() => {
  window.removeEventListener('keydown', down);
  window.removeEventListener('keyup', up);
});
</script>

<template>
  <!-- your toolbar and pages -->
</template>
