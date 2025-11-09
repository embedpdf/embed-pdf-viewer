<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useExport } from '@embedpdf/plugin-export/vue';

const props = defineProps<{
  documentId: string;
}>();

const { provides: exportApi } = useExport(() => props.documentId);
</script>

<template>
  <div style="height: 500px">
    <div class="flex h-full flex-col">
      <div
        class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          @click="exportApi?.download()"
          :disabled="!exportApi"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Download PDF"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
      <div class="flex-grow" style="position: relative">
        <Viewport
          :document-id="documentId"
          style="
            background-color: #f1f3f5;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
          "
        >
          <Scroller :document-id="documentId">
            <template #default="{ page }">
              <div
                :style="{
                  width: page.width + 'px',
                  height: page.height + 'px',
                  position: 'relative',
                }"
              >
                <RenderLayer :document-id="documentId" :page-index="page.pageIndex" :scale="1" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
