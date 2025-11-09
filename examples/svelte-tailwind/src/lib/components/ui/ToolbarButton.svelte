<script lang="ts">
  import type { Snippet } from 'svelte';

  interface ToolbarButtonProps {
    onclick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: Snippet;
    'aria-label': string;
    title?: string;
    class?: string;
  }

  let {
    onclick,
    isActive = false,
    disabled = false,
    children,
    'aria-label': ariaLabel,
    title,
    class: className = '',
  }: ToolbarButtonProps = $props();
</script>

<button
  {onclick}
  {disabled}
  class="rounded p-2 transition-colors {isActive
    ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'} {disabled
    ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-gray-600'
    : ''} {className}"
  aria-label={ariaLabel}
  aria-pressed={isActive}
  aria-disabled={disabled}
  {title}
>
  {@render children()}
</button>
