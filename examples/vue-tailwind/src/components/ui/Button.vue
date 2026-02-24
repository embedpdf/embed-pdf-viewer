<template>
  <button @click="onClick" :disabled="disabled" :class="buttonClasses" :title="tooltip">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost';

const props = withDefaults(
  defineProps<{
    onClick?: () => void;
    variant?: ButtonVariant;
    active?: boolean;
    disabled?: boolean;
    className?: string;
    tooltip?: string;
  }>(),
  {
    variant: 'default',
    active: false,
    disabled: false,
  },
);

const variantStyles: Record<ButtonVariant, string> = {
  default: 'hover:bg-gray-100 hover:ring hover:ring-[#1a466b]',
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50',
  ghost: 'text-gray-700 hover:bg-gray-100 disabled:opacity-50',
};

const buttonClasses = computed(() => {
  if (props.variant === 'default') {
    return [
      'flex h-[32px] w-auto min-w-[32px] items-center justify-center rounded-md p-[5px] transition-colors',
      props.active
        ? 'border-none bg-blue-50 text-blue-500 shadow ring ring-blue-500'
        : variantStyles.default,
      props.disabled
        ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:ring-0'
        : 'cursor-pointer',
      props.className,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    'rounded-md px-4 py-2 text-sm font-medium transition-colors',
    variantStyles[props.variant],
    props.className,
  ]
    .filter(Boolean)
    .join(' ');
});
</script>
