<script setup lang="ts">
import { computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { AnnotationLayer, LockModeType, useAnnotation } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { useZoom } from '@embedpdf/plugin-zoom/vue';
import { Lock, LockOpen, ZoomIn, ZoomOut } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const fillModeLock = {
  type: LockModeType.Include,
  categories: ['form'],
};

const annotation = useAnnotation(() => props.documentId);
const zoom = useZoom(() => props.documentId);

const fillMode = computed(
  () =>
    annotation.state.value.locked.type === LockModeType.Include &&
    annotation.state.value.locked.categories?.includes('form'),
);

const toggleMode = () => {
  annotation.provides.value?.setLocked(fillMode.value ? { type: LockModeType.None } : fillModeLock);
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-center gap-2">
        <span
          :class="[
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            fillMode
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
          ]"
        >
          <template v-if="fillMode">
            <Lock :size="14" />
            Fill Mode
          </template>
          <template v-else>
            <LockOpen :size="14" />
            Design Mode
          </template>
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            @click="zoom.provides.value?.zoomOut()"
            :disabled="!zoom.provides.value"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom Out"
          >
            <ZoomOut :size="16" />
          </button>

          <button
            type="button"
            @click="zoom.provides.value?.zoomIn()"
            :disabled="!zoom.provides.value"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom In"
          >
            <ZoomIn :size="16" />
          </button>
        </div>

        <button
          type="button"
          @click="toggleMode"
          :disabled="!annotation.provides.value"
          class="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <template v-if="fillMode">
            <LockOpen :size="16" />
            Switch to Design Mode
          </template>
          <template v-else>
            <Lock :size="16" />
            Switch to Fill Mode
          </template>
        </button>
      </div>
    </div>

    <div class="relative h-[420px] sm:h-[550px]" style="user-select: none">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                style="pointer-events: none"
              />
              <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
              <AnnotationLayer :document-id="documentId" :page-index="page.pageIndex" />
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
