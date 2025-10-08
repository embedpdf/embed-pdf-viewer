<script setup lang="ts">
import { useViewportCapability } from '@embedpdf/plugin-viewport/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';
import { ref, computed, watch, onUnmounted } from 'vue';

const { provides: viewport } = useViewportCapability();
const { provides: scroll, state } = useScroll();

const isVisible = ref(false);
const isHovering = ref(false);
const hideTimeoutRef = ref<number | null>(null);
const inputValue = ref<string>('1');

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
  hideTimeoutRef.value = setTimeout(() => {
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
      if (activity) {
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

const handlePageSubmit = () => {
  const page = parseInt(inputValue.value);

  if (!isNaN(page) && page >= 1 && page <= state.value.totalPages && scroll.value) {
    scroll.value.scrollToPage({
      pageNumber: page,
    });
  }
};

const handlePreviousPage = () => {
  if (state.value.currentPage > 1 && scroll.value) {
    scroll.value.scrollToPage({
      pageNumber: state.value.currentPage - 1,
    });
  }
};

const handleNextPage = () => {
  if (state.value.currentPage < state.value.totalPages && scroll.value) {
    scroll.value.scrollToPage({
      pageNumber: state.value.currentPage + 1,
    });
  }
};

const handleInputChange = (value: string | number | null) => {
  // Only allow numeric input
  const stringValue = value === null ? '' : String(value);
  const numericValue = stringValue.replace(/[^0-9]/g, '');
  inputValue.value = numericValue;
};

const isPreviousDisabled = computed(() => state.value.currentPage === 1);
const isNextDisabled = computed(() => state.value.currentPage === state.value.totalPages);
</script>
<template>
  <div @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave" class="page-controls">
    <q-card flat bordered class="page-controls-card row items-center q-gutter-sm">
      <!-- Previous page button -->
      <q-btn
        flat
        round
        dense
        icon="mdi-chevron-left"
        :disable="isPreviousDisabled"
        @click="handlePreviousPage"
      />

      <!-- Page input form -->
      <form @submit.prevent="handlePageSubmit" class="page-form row items-center q-gutter-xs">
        <q-input
          dense
          outlined
          class="page-input"
          input-class="text-center"
          :model-value="inputValue"
          @update:model-value="handleInputChange"
          @keyup.enter.prevent="handlePageSubmit"
          hide-bottom-space
        />
        <span class="page-text">/</span>
        <span class="page-text">{{ state.totalPages }}</span>
      </form>

      <!-- Next page button -->
      <q-btn
        flat
        round
        dense
        icon="mdi-chevron-right"
        :disable="isNextDisabled"
        @click="handleNextPage"
      />
    </q-card>
  </div>
</template>

<style scoped>
.page-controls {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  z-index: 1000;
  opacity: v-bind('isVisible ? 1 : 0');
  transition: opacity 0.2s ease-in-out;
  pointer-events: none;
}

.page-controls-card {
  background-color: #f8f9fa;
  padding: 6px 10px;
  border-radius: 10px;
  pointer-events: auto;
}

.page-input {
  width: 48px;
}

.page-text {
  color: #6c757d;
  font-size: 14px;
}
</style>
