<script setup lang="ts">
import { computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useCommand } from '@embedpdf/plugin-commands/vue';
import { Keyboard, ChevronLeft, ChevronRight, Info } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { state: scrollState } = useScroll(() => props.documentId);

// Commands
const prevCommand = useCommand(
  () => 'nav.prev',
  () => props.documentId,
);
const nextCommand = useCommand(
  () => 'nav.next',
  () => props.documentId,
);
const alertCommand = useCommand(
  () => 'doc.alert',
  () => props.documentId,
);

// Format shortcut for display
const formatShortcut = (shortcut: string) => {
  return shortcut
    .replace('arrowleft', '←')
    .replace('arrowright', '→')
    .replace('ctrl+', '⌃')
    .replace('meta+', '⌘')
    .toUpperCase();
};
</script>

<template>
  <!-- Toolbar -->
  <div
    class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
      <Keyboard :size="14" />
      <span class="hidden uppercase tracking-wide sm:inline">Commands</span>
    </div>
    <div class="h-4 w-px bg-gray-300 dark:bg-gray-600" />

    <!-- Navigation -->
    <div class="flex items-center gap-1">
      <!-- Previous -->
      <button
        v-if="prevCommand"
        @click="prevCommand.execute"
        :disabled="prevCommand.disabled"
        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        :title="prevCommand.shortcuts ? `Shortcut: ${prevCommand.shortcuts.join(', ')}` : undefined"
      >
        <ChevronLeft :size="14" />
        <kbd
          v-if="prevCommand.shortcuts?.[0]"
          class="hidden items-center rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
        >
          {{ formatShortcut(prevCommand.shortcuts[0]) }}
        </kbd>
      </button>

      <!-- Page indicator -->
      <div
        class="min-w-[80px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
      >
        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
          {{ scrollState?.currentPage }}
          <span class="text-gray-500 dark:text-gray-400">/</span>
          {{ scrollState?.totalPages }}
        </span>
      </div>

      <!-- Next -->
      <button
        v-if="nextCommand"
        @click="nextCommand.execute"
        :disabled="nextCommand.disabled"
        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        :title="nextCommand.shortcuts ? `Shortcut: ${nextCommand.shortcuts.join(', ')}` : undefined"
      >
        <ChevronRight :size="14" />
        <kbd
          v-if="nextCommand.shortcuts?.[0]"
          class="hidden items-center rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
        >
          {{ formatShortcut(nextCommand.shortcuts[0]) }}
        </kbd>
      </button>
    </div>

    <div class="flex-1" />

    <!-- Actions -->
    <button
      v-if="alertCommand"
      @click="alertCommand.execute"
      :disabled="alertCommand.disabled"
      class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
      :title="alertCommand.shortcuts ? `Shortcut: ${alertCommand.shortcuts.join(', ')}` : undefined"
    >
      <Info :size="14" />
      <span class="hidden sm:inline">{{ alertCommand.label }}</span>
      <kbd
        v-if="alertCommand.shortcuts?.[0]"
        class="hidden items-center rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
      >
        {{ formatShortcut(alertCommand.shortcuts[0]) }}
      </kbd>
    </button>

    <!-- Hint -->
    <span class="hidden text-[10px] text-gray-600 lg:inline dark:text-gray-300">
      Use keyboard shortcuts to navigate
    </span>
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[400px] sm:h-[500px]">
    <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller :document-id="documentId">
        <template #default="{ page }">
          <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
        </template>
      </Scroller>
    </Viewport>
  </div>
</template>
