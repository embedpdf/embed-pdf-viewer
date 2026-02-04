<script setup lang="ts">
import { ref } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { usePrint } from '@embedpdf/plugin-print/vue';
import { Loader2, Printer } from 'lucide-vue-next';

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
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Toolbar -->
    <div
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        @click="handlePrint"
        :disabled="!print || isPrinting"
        class="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Loader2 v-if="isPrinting" :size="16" class="animate-spin" />
        <Printer v-else :size="16" />
        {{ isPrinting ? 'Preparing...' : 'Print Document' }}
      </button>
      <span v-if="!isPrinting" class="text-xs text-gray-600 dark:text-gray-300">
        Opens your system print dialog
      </span>
      <span v-if="isPrinting" class="animate-pulse text-xs text-blue-600 dark:text-blue-400">
        Rendering pages for print...
      </span>
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
