<template>
  <div
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    :class="[
      'absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 transition-opacity duration-200',
      isVisible ? 'opacity-100' : 'opacity-0',
    ]"
  >
    <div class="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 p-1 shadow-lg">
      <!-- Previous Button -->
      <button
        @click="handlePreviousPage"
        :disabled="state.currentPage === 1"
        class="rounded p-1 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
        aria-label="Previous page"
      >
        <ChevronLeftIcon class="h-5 w-5" />
      </button>

      <!-- Page Input -->
      <form @submit.prevent="handlePageChange" class="flex items-center gap-2">
        <input
          v-model="inputValue"
          type="text"
          name="page"
          @input="handleInput"
          class="h-7 w-10 rounded border border-gray-300 bg-white px-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span class="text-sm text-gray-600">/ {{ state.totalPages }}</span>
      </form>

      <!-- Next Button -->
      <button
        @click="handleNextPage"
        :disabled="state.currentPage === state.totalPages"
        class="rounded p-1 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
        aria-label="Next page"
      >
        <ChevronRightIcon class="h-5 w-5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useViewportCapability } from '@embedpdf/plugin-viewport/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons.vue';

const props = defineProps<{
  documentId: string;
}>();

const { provides: viewport } = useViewportCapability();
const { provides: scroll, state } = useScroll(() => props.documentId);

const isVisible = ref(false);
const isHovering = ref(false);
const inputValue = ref<string>('1');
const hideTimeoutRef = ref<number | null>(null);

// Update input value when current page changes
watch(
  () => state.value.currentPage,
  (newPage) => {
    inputValue.value = newPage.toString();
  },
  { immediate: true },
);

const startHideTimer = () => {
  if (hideTimeoutRef.value) {
    clearTimeout(hideTimeoutRef.value);
  }
  hideTimeoutRef.value = window.setTimeout(() => {
    if (!isHovering.value) {
      isVisible.value = false;
    }
  }, 4000);
};

// Watch for scroll activity
watch(
  viewport,
  (newViewport) => {
    if (!newViewport) return;

    return newViewport.onScrollActivity((activity) => {
      if (activity && activity.documentId === props.documentId) {
        isVisible.value = true;
        startHideTimer();
      }
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  if (hideTimeoutRef.value) {
    clearTimeout(hideTimeoutRef.value);
  }
});

const handleMouseEnter = () => {
  isHovering.value = true;
  isVisible.value = true;
};

const handleMouseLeave = () => {
  isHovering.value = false;
  startHideTimer();
};

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const value = target.value.replace(/[^0-9]/g, '');
  inputValue.value = value;
};

const handlePageChange = () => {
  const page = parseInt(inputValue.value);
  if (!isNaN(page) && page >= 1 && page <= state.value.totalPages && scroll.value) {
    scroll.value.scrollToPage({
      pageNumber: page,
    });
  }
};

const handlePreviousPage = (e: MouseEvent) => {
  e.preventDefault();
  (e.currentTarget as HTMLButtonElement).blur();
  if (state.value.currentPage > 1 && scroll.value) {
    scroll.value.scrollToPreviousPage();
  }
};

const handleNextPage = (e: MouseEvent) => {
  e.preventDefault();
  (e.currentTarget as HTMLButtonElement).blur();
  if (state.value.currentPage < state.value.totalPages && scroll.value) {
    scroll.value.scrollToNextPage();
  }
};
</script>
