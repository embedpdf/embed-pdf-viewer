<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
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
import { Copy, Type, Check } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { provides: selectionCapability } = useSelectionCapability();
const selection = computed(() => selectionCapability.value?.forDocument(props.documentId));
const hasSelection = ref(false);
const selectedText = ref('');
const copied = ref(false);
const menuCopied = ref(false);

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

const handleCopy = () => {
  selection.value?.copyToClipboard();
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
};

const handleCopyFromMenu = () => {
  selection.value?.copyToClipboard();
  selection.value?.clear();
  menuCopied.value = true;
  setTimeout(() => {
    menuCopied.value = false;
  }, 1500);
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <!-- Toolbar -->
    <div
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        @click="handleCopy"
        :disabled="!hasSelection"
        :class="[
          'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-all',
          hasSelection
            ? 'bg-blue-500 text-white ring-1 ring-blue-600 hover:bg-blue-600'
            : 'cursor-not-allowed bg-white text-gray-400 ring-1 ring-gray-300 dark:bg-gray-700 dark:text-gray-500 dark:ring-gray-600',
        ]"
        title="Copy Selected Text"
      >
        <Check v-if="copied" :size="14" class="text-white" />
        <Copy v-else :size="14" />
        {{ copied ? 'Copied!' : 'Copy Text' }}
      </button>
      <span class="text-xs text-gray-600 dark:text-gray-300">
        {{ hasSelection ? 'Text selected — click to copy' : 'Click and drag to select text' }}
      </span>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                :scale="1"
                class="pointer-events-none"
              />
              <SelectionLayer :document-id="documentId" :page-index="page.pageIndex">
                <template #selection-menu="{ rect, menuWrapperProps, placement }">
                  <div v-bind="menuWrapperProps">
                    <div
                      class="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                      :style="{
                        position: 'absolute',
                        top: placement.suggestTop ? '-48px' : `${rect.size.height + 8}px`,
                        pointerEvents: 'auto',
                        cursor: 'default',
                      }"
                    >
                      <div class="flex items-center gap-1 px-2 py-1">
                        <button
                          @click="handleCopyFromMenu"
                          class="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                          aria-label="Copy selected text"
                          title="Copy"
                        >
                          <template v-if="menuCopied">
                            <Check :size="16" class="text-green-600 dark:text-green-400" />
                            <span class="text-green-600 dark:text-green-400">Copied!</span>
                          </template>
                          <template v-else>
                            <Copy :size="16" />
                            <span>Copy</span>
                          </template>
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </SelectionLayer>
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>

    <!-- Selected Text Panel -->
    <div class="border-t border-gray-300 bg-gray-100 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-2 flex items-center gap-2">
        <Type :size="14" class="text-gray-500 dark:text-gray-400" />
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
          Selected Text
        </span>
      </div>
      <div
        v-if="hasSelection"
        class="mt-2 rounded-md border border-gray-300 bg-white p-3 dark:border-gray-600 dark:bg-gray-900"
      >
        <p class="m-0 whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-200">
          {{ selectedText || 'Loading...' }}
        </p>
      </div>
      <div v-else class="mt-2 flex flex-col items-center justify-center py-6 text-center">
        <div
          class="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
        >
          <Type :size="20" class="text-gray-400 dark:text-gray-500" />
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Select text in the PDF to see it here
        </p>
      </div>
    </div>
  </div>
</template>
