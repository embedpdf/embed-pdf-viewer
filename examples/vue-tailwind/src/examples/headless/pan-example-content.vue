<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { usePan } from '@embedpdf/plugin-pan/vue';
import { Hand } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { provides: pan, isPanning } = usePan(() => props.documentId);
</script>

<template>
  <div
    class="select-none overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Toolbar -->
    <div
      v-if="pan"
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        @click="pan.togglePan"
        :class="[
          'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-all',
          isPanning
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
        ]"
        title="Toggle Pan Tool"
      >
        <Hand :size="16" />
        {{ isPanning ? 'Pan Mode On' : 'Pan Mode' }}
      </button>
      <span class="text-xs text-gray-600 dark:text-gray-300">
        {{ isPanning ? 'Click and drag to pan the document' : 'Click to enable pan mode' }}
      </span>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <GlobalPointerProvider :document-id="documentId">
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
                <RenderLayer
                  :document-id="documentId"
                  :page-index="page.pageIndex"
                  :scale="1"
                  class="pointer-events-none"
                />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </GlobalPointerProvider>
    </div>
  </div>
</template>
