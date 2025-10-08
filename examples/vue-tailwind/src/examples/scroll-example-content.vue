<script setup lang="ts">
import { ref, watch } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';

const { provides: scroll, state } = useScroll();
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
  <div style="height: 500px">
    <div class="flex h-full flex-col">
      <div
        class="mb-4 mt-4 flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          @click="scroll?.scrollToPreviousPage()"
          :disabled="state.currentPage <= 1"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-50"
          title="Previous Page"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <form @submit="handleGoToPage" class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-600">Page</span>
          <input
            v-model="pageInput"
            type="number"
            :min="1"
            :max="state.totalPages"
            class="h-8 w-16 rounded-md border-gray-300 text-center text-sm shadow-sm"
          />
          <span class="text-sm font-medium text-gray-600">of {{ state.totalPages }}</span>
        </form>
        <button
          @click="scroll?.scrollToNextPage()"
          :disabled="state.currentPage >= state.totalPages"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-50"
          title="Next Page"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
      <div class="relative flex w-full flex-1 overflow-hidden">
        <Viewport class="flex-grow bg-gray-100">
          <Scroller>
            <template #default="{ page }">
              <div
                :style="{
                  width: page.width + 'px',
                  height: page.height + 'px',
                  position: 'relative',
                }"
              >
                <RenderLayer :page-index="page.pageIndex" :scale="page.scale" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
