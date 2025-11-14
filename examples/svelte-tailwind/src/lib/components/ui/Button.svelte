<script lang="ts">
  import type { Snippet } from 'svelte';

  type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost';

  interface ButtonProps {
    children: Snippet;
    variant?: ButtonVariant;
    onclick?: () => void;
    active?: boolean;
    disabled?: boolean;
    class?: string;
    tooltip?: string;
  }

  let {
    children,
    onclick,
    variant = 'default',
    active = false,
    disabled = false,
    class: className = '',
    tooltip,
  }: ButtonProps = $props();

  const variantStyles: Record<ButtonVariant, string> = {
    default: 'hover:bg-gray-100 hover:ring hover:ring-[#1a466b]',
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50',
    secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50',
    ghost: 'text-gray-700 hover:bg-gray-100 disabled:opacity-50',
  };
</script>

{#if variant === 'default'}
  <button
    {onclick}
    {disabled}
    class="flex h-[32px] w-auto min-w-[32px] items-center justify-center rounded-md p-[5px] transition-colors {active
      ? 'border-none bg-blue-50 text-blue-500 shadow ring ring-blue-500'
      : variantStyles.default} {disabled
      ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:ring-0'
      : 'cursor-pointer'} {className}"
    title={tooltip}
  >
    {@render children()}
  </button>
{:else}
  <button
    {onclick}
    {disabled}
    class="rounded-md px-4 py-2 text-sm font-medium transition-colors {variantStyles[
      variant
    ]} {className}"
    title={tooltip}
  >
    {@render children()}
  </button>
{/if}
