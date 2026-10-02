<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCommands } from '@embedpdf/vue/commands';
import Result from './Result.vue';

const commands = useCommands();
const query = ref('page');
const results = computed(() => commands.searchCommands(query.value));

// Enter runs the first result that can run now.
function onKeyDown(event: KeyboardEvent) {
  const first = results.value.find((command) => commands.canExecute(command.id));
  if (event.key === 'Enter' && first) void commands.execute(first.id);
}
</script>

<template>
  <div class="palette">
    <input
      v-model="query"
      class="field"
      type="search"
      aria-label="Search commands"
      placeholder="Type a command…"
      @keydown="onKeyDown"
    />
    <ul class="results">
      <Result v-for="command in results" :id="command.id" :key="command.id" />
      <li v-if="results.length === 0" class="empty">No command matches</li>
    </ul>
  </div>
</template>
