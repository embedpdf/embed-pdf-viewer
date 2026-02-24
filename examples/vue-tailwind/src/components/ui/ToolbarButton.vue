<template>
  <button
    @click="onClick"
    :disabled="disabled"
    :class="mergedClasses"
    :aria-label="ariaLabel"
    :aria-pressed="isActive"
    :aria-disabled="disabled"
    :title="title || ariaLabel"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { twMerge } from 'tailwind-merge';

const props = withDefaults(
  defineProps<{
    onClick?: () => void;
    isActive?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
    className?: string;
  }>(),
  {
    isActive: false,
    disabled: false,
    className: '',
  },
);

const baseClasses = computed(() =>
  props.isActive
    ? 'border-none bg-blue-50 text-blue-500 shadow ring ring-blue-500'
    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 hover:ring hover:ring-[#1a466b]',
);

const disabledClasses = computed(() =>
  props.disabled
    ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-gray-600 hover:ring-0'
    : '',
);

const mergedClasses = computed(() =>
  twMerge(
    'rounded p-1.5 transition-colors',
    baseClasses.value,
    disabledClasses.value,
    props.className,
  ),
);
</script>
