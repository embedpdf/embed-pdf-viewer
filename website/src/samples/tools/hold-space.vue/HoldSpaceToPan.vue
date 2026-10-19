<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useInteraction } from '@embedpdf/vue/interaction';

// While Space is held over the pages, the hand tool is active; on release, the tool from before.
const interaction = useInteraction();
// Only over the pages, so Space still scrolls the rest of your page.
const viewer = ref<HTMLDivElement | null>(null);
let held = false;

function down(event: KeyboardEvent) {
  if (event.code !== 'Space' || !viewer.value?.matches(':hover')) return;
  event.preventDefault();
  if (event.repeat || held) return;
  held = true;
  interaction.pushTool('pan');
}

function up(event: KeyboardEvent) {
  if (event.code !== 'Space' || !held) return;
  held = false;
  interaction.popTool();
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
  <div ref="viewer" class="viewer">
    <slot />
  </div>
</template>
