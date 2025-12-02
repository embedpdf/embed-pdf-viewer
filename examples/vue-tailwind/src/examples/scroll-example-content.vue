<script setup lang="ts">
import { ref, watch } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { provides: scroll, state } = useScroll(() => props.documentId);
const pageInput = ref(String(state.value.currentPage));

watch(
  () => state.value.currentPage,
  (newPage) => {
    pageInput.value = String(newPage);
  },
);

const handleGoToPage = (e: Event) => {
  e.preventDefault();
  const pageNumber = parseInt(pageInput.value, 10);
  if (pageNumber >= 1 && pageNumber <= state.value.totalPages) {
    scroll.value?.scrollToPage({ pageNumber });
  }
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Navigation Toolbar -->
    <div
      class="flex items-center justify-center gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        @click="scroll?.scrollToPreviousPage()"
        :disabled="state.currentPage <= 1"
        class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Previous Page"
      >
        <ChevronLeft :size="18" />
      </button>
      <form @submit="handleGoToPage" class="flex items-center gap-2">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300"
          >Page</span
        >
        <input
          v-model="pageInput"
          type="number"
          :min="1"
          :max="state.totalPages"
          class="h-8 w-14 rounded-md border-0 bg-white px-2 text-center font-mono text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600"
        />
        <span class="text-xs font-medium text-gray-600 dark:text-gray-300"
          >of {{ state.totalPages }}</span
        >
      </form>
      <button
        @click="scroll?.scrollToNextPage()"
        :disabled="state.currentPage >= state.totalPages"
        class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
        title="Next Page"
      >
        <ChevronRight :size="18" />
      </button>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
