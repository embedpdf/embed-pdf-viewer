<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/vue';
import { FileText, BookOpen, Book } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { provides: spread, spreadMode } = useSpread(() => props.documentId);

const modes = [
  { label: 'Single', value: SpreadMode.None, icon: FileText },
  { label: 'Odd Spread', value: SpreadMode.Odd, icon: BookOpen },
  { label: 'Even Spread', value: SpreadMode.Even, icon: Book },
];
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Toolbar -->
    <div
      v-if="spread"
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Layout
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          v-for="mode in modes"
          :key="mode.value"
          @click="spread.setSpreadMode(mode.value)"
          :class="[
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
            spreadMode === mode.value
              ? 'bg-blue-500 text-white ring-1 ring-blue-600'
              : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
          ]"
        >
          <component :is="mode.icon" :size="14" />
          <span class="hidden sm:inline">{{ mode.label }}</span>
        </button>
      </div>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <div
              :style="{
                width: page.width + 'px',
                height: page.height + 'px',
                position: 'relative',
              }"
            >
              <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
            </div>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
