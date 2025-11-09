<script setup lang="ts">
import { ref } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { usePrint } from '@embedpdf/plugin-print/vue';

const props = defineProps<{
  documentId: string;
}>();

const { provides: print } = usePrint(() => props.documentId);
const isPrinting = ref(false);

const handlePrint = () => {
  if (!print.value || isPrinting.value) return;
  isPrinting.value = true;
  const printTask = print.value.print();
  printTask.wait(
    () => {
      isPrinting.value = false;
    },
    () => {
      isPrinting.value = false;
    },
  );
};
</script>

<template>
  <div style="height: 500px">
    <div class="flex h-full flex-col">
      <div
        class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          @click="handlePrint"
          :disabled="!print || isPrinting"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Print Document"
        >
          <svg
            v-if="isPrinting"
            class="h-5 w-5 animate-spin text-gray-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <svg
            v-else
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"
            />
            <path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" />
            <path
              d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z"
            />
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
                <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
