<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { useRotate, Rotate } from '@embedpdf/plugin-rotate/vue';
import { RotateCcw, RotateCw } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { rotation, provides: rotate } = useRotate(() => props.documentId);
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Toolbar -->
    <div
      v-if="rotate"
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Rotation
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

      <!-- Rotation controls -->
      <div class="flex items-center gap-1.5">
        <button
          @click="rotate.rotateBackward"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Rotate Counter-Clockwise"
        >
          <RotateCcw :size="16" />
        </button>

        <!-- Degree indicator -->
        <div
          class="min-w-[56px] rounded-md bg-white px-2 py-1 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
        >
          <span class="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ rotation * 90 }}°
          </span>
        </div>

        <button
          @click="rotate.rotateForward"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Rotate Clockwise"
        >
          <RotateCw :size="16" />
        </button>
      </div>

      <span class="hidden text-xs text-gray-600 sm:inline dark:text-gray-300">
        Click to rotate all pages
      </span>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <Rotate :document-id="documentId" :page-index="page.pageIndex">
              <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
                <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
              </PagePointerProvider>
            </Rotate>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
