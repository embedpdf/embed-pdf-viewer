<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/vue';

const props = defineProps<{
  documentId: string;
}>();

const { state, provides } = useScroll(() => props.documentId);
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] sm:h-[500px]">
      <!-- Thumbnail Sidebar -->
      <div
        class="h-full w-[140px] flex-shrink-0 border-r border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
      >
        <ThumbnailsPane :document-id="documentId">
          <template #default="{ meta }">
            <div
              :key="meta.pageIndex"
              class="absolute flex w-full cursor-pointer flex-col items-center px-2"
              :style="{
                height: meta.wrapperHeight + 'px',
                top: meta.top + 'px',
              }"
              @click="provides?.scrollToPage?.({ pageNumber: meta.pageIndex + 1 })"
            >
              <div
                :class="[
                  'overflow-hidden rounded-md transition-all',
                  state.currentPage === meta.pageIndex + 1
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-900'
                    : 'ring-1 ring-gray-300 hover:ring-gray-400 dark:ring-gray-700 dark:hover:ring-gray-600',
                ]"
                :style="{
                  width: meta.width + 'px',
                  height: meta.height + 'px',
                }"
              >
                <ThumbImg
                  :document-id="documentId"
                  :meta="meta"
                  :style="{ width: '100%', height: '100%', objectFit: 'contain' }"
                />
              </div>
              <div
                class="mt-1 flex items-center justify-center"
                :style="{ height: meta.labelHeight + 'px' }"
              >
                <span
                  :class="[
                    'text-xs font-medium',
                    state.currentPage === meta.pageIndex + 1
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-300',
                  ]"
                >
                  {{ meta.pageIndex + 1 }}
                </span>
              </div>
            </div>
          </template>
        </ThumbnailsPane>
      </div>

      <!-- PDF Viewer Area -->
      <div class="relative flex-1">
        <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
          <Scroller :document-id="documentId">
            <template #default="{ page }">
              <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
