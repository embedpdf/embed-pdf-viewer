<template>
  <div
    v-if="open"
    ref="overlayRef"
    class="fixed inset-0 z-50 bg-black/50 md:flex md:items-center md:justify-center"
    @click="handleBackdropClick"
  >
    <div
      :class="[
        'relative flex h-full w-full flex-col bg-white md:h-auto md:w-[28rem] md:max-w-[90vw] md:rounded-lg md:border md:border-gray-200 md:shadow-lg',
        className,
      ]"
      :style="{ maxWidth }"
      @click.stop
    >
      <!-- Header -->
      <div
        v-if="title || showCloseButton"
        class="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4"
      >
        <h2 v-if="title" class="text-lg font-semibold text-gray-900">{{ title }}</h2>
        <button
          v-if="showCloseButton"
          @click="onClose"
          class="rounded p-1 hover:bg-gray-100"
          aria-label="Close dialog"
        >
          <CloseIcon class="h-5 w-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 space-y-6 overflow-y-auto px-6 py-4 md:max-h-[80vh] md:flex-none">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { CloseIcon } from '../icons';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    onClose?: () => void;
    className?: string;
    showCloseButton?: boolean;
    maxWidth?: string;
  }>(),
  {
    showCloseButton: true,
    maxWidth: '32rem',
  },
);

const overlayRef = ref<HTMLDivElement | null>(null);

const handleBackdropClick = (e: MouseEvent) => {
  if (e.target === overlayRef.value) {
    props.onClose?.();
  }
};

// Handle escape key
const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.open) {
    props.onClose?.();
  }
};

// Prevent body scroll when dialog is open
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    } else {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleEscape);
});
</script>
