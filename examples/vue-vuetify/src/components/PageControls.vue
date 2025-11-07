<script setup lang="ts">
import { useViewportCapability } from '@embedpdf/plugin-viewport/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';
import { ref, computed, watch, onUnmounted } from 'vue';

interface PageControlsProps {
  documentId: string;
}

const props = defineProps<PageControlsProps>();

const { provides: viewport } = useViewportCapability();
const { provides: scroll, state } = useScroll(() => props.documentId);

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
      const currentDocId = props.documentId;
      if (activity && activity.documentId === currentDocId) {
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
    scroll.value.scrollToPreviousPage();
  }
};

const handleNextPage = () => {
  if (state.value.currentPage < state.value.totalPages && scroll.value) {
    scroll.value.scrollToNextPage();
  }
};

const handleInputChange = (value: string) => {
  // Only allow numeric input
  const numericValue = value.replace(/[^0-9]/g, '');
  inputValue.value = numericValue;
};

const isPreviousDisabled = computed(() => state.value.currentPage === 1);
const isNextDisabled = computed(() => state.value.currentPage === state.value.totalPages);
</script>

<template>
  <div @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave" class="page-controls">
    <v-card elevation="0" class="page-controls-card">
      <!-- Previous page button -->
      <v-btn
        @click="handlePreviousPage"
        :disabled="isPreviousDisabled"
        icon="mdi-chevron-left"
        variant="text"
        size="small"
        density="compact"
      />

      <!-- Page input form -->
      <form @submit.prevent="handlePageSubmit" class="page-form">
        <v-text-field
          :model-value="inputValue"
          @update:model-value="handleInputChange"
          variant="outlined"
          density="compact"
          hide-details
          class="page-input"
        />
        <span class="page-separator">/</span>
        <span class="total-pages">{{ state.totalPages }}</span>
      </form>

      <!-- Next page button -->
      <v-btn
        @click="handleNextPage"
        :disabled="isNextDisabled"
        icon="mdi-chevron-right"
        variant="text"
        size="small"
        density="compact"
      />
    </v-card>
  </div>
</template>

<style scoped>
.page-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  opacity: v-bind(isVisible ? 1: 0);
  transition: opacity 0.2s ease-in-out;
}

.page-controls-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  background-color: #f8f9fa;
  border: 1px solid #cfd4da;
}

.page-form {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-input {
  width: 40px;
}

.page-input :deep(.v-field__input) {
  text-align: center;
  font-size: 14px;
  min-height: 25px;
  padding: 4px;
}

.page-separator,
.total-pages {
  color: #6c757d;
  font-size: 14px;
}
</style>
