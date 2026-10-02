<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCommands, useCommandsEvent } from '@embedpdf/vue/commands';
import ShortcutRow from './ShortcutRow.vue';

// The sheet lists every shortcut, and shows the last command a key ran.
const commands = useCommands();
const shortcuts = computed(() => commands.listShortcuts());
const last = ref<string | null>(null);

useCommandsEvent(
  (commands) => commands.onExecuted,
  ({ commandId }) => {
    last.value = commands.resolveCommand(commandId)?.label ?? commandId;
  },
);
</script>

<template>
  <aside class="sheet">
    <p class="status">
      {{ last ? `Ran: ${last}` : 'Click the viewer, then press a key, such as → for the next page' }}
    </p>
    <ul class="rows">
      <ShortcutRow
        v-for="{ commandId, shortcut } in shortcuts"
        :id="commandId"
        :key="`${commandId} ${shortcut}`"
        :shortcut="shortcut"
      />
    </ul>
  </aside>
</template>
