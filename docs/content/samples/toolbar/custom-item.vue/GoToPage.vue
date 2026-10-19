<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useCommands } from '@embedpdf/vue/commands';
import PageNumber from './PageNumber.vue';

// 'page:go-to', a command of your own: it opens a small "Go to page" form.
const commands = useCommands();
const open = ref(false);

let unregister: (() => void) | undefined;
onMounted(() => {
  unregister = commands.registerCommand({
    id: 'page:go-to',
    label: 'Go to page…',
    run: () => {
      open.value = true;
    },
  });
});
onUnmounted(() => unregister?.());
</script>

<template>
  <div v-if="open" class="go-to" role="dialog" aria-label="Go to page">
    <PageNumber :compact="false" />
    <button type="button" class="button" @click="open = false">Done</button>
  </div>
</template>
