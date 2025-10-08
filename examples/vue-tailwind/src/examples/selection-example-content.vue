<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import {
  SelectionLayer,
  useSelectionCapability,
  type SelectionRangeX,
} from '@embedpdf/plugin-selection/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { ignore } from '@embedpdf/models';

const { provides: selection } = useSelectionCapability();
const hasSelection = ref(false);
const selectedText = ref('');

let unsubscribeSelectionChange: (() => void) | undefined;
let unsubscribeEndSelection: (() => void) | undefined;

onMounted(() => {
  if (!selection.value) return;

  unsubscribeSelectionChange = selection.value.onSelectionChange(
    (selectionRange: SelectionRangeX | null) => {
      hasSelection.value = !!selectionRange;
      if (!selectionRange) {
        selectedText.value = '';
      }
    },
  );

  unsubscribeEndSelection = selection.value.onEndSelection(() => {
    const textTask = selection.value!.getSelectedText();
    textTask.wait((textLines) => {
      selectedText.value = textLines.join('\n');
    }, ignore);
  });
});

onUnmounted(() => {
  unsubscribeSelectionChange?.();
  unsubscribeEndSelection?.();
});
</script>

<template>
  <div>
    <div style="height: 500px; user-select: none">
      <div class="flex h-full flex-col gap-4">
        <div
          class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
        >
          <button
            @click="selection?.copyToClipboard()"
            :disabled="!hasSelection"
            class="flex h-8 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Copy Selected Text"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy Text
          </button>
        </div>
        <div class="relative flex w-full flex-1 overflow-hidden">
          <Viewport class="flex-grow bg-gray-100">
            <Scroller>
              <template #default="{ page }">
                <PagePointerProvider
                  :page-index="page.pageIndex"
                  :page-width="page.width"
                  :page-height="page.height"
                  :rotation="page.rotation"
                  :scale="page.scale"
                >
                  <RenderLayer
                    :page-index="page.pageIndex"
                    :scale="1"
                    class="pointer-events-none"
                  />
                  <SelectionLayer :page-index="page.pageIndex" :scale="page.scale" />
                </PagePointerProvider>
              </template>
            </Scroller>
          </Viewport>
        </div>
      </div>
    </div>
    <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p class="m-0 text-xs font-medium uppercase text-gray-500">Selected Text:</p>
      <div class="mt-2">
        <div
          v-if="hasSelection"
          class="m-0 w-full whitespace-pre-line break-words text-sm text-gray-800"
        >
          {{ selectedText || 'Loading...' }}
        </div>
        <p v-else class="m-0 text-sm italic text-gray-400">Select text in the PDF to see it here</p>
      </div>
    </div>
  </div>
</template>
