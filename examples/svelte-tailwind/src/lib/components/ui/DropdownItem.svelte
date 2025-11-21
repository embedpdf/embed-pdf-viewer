<script lang="ts">
  import type { Snippet } from 'svelte';

  interface DropdownItemProps {
    onclick: () => void;
    icon?: Snippet;
    children: Snippet;
    isActive?: boolean;
  }

  let { onclick, icon, children, isActive = false }: DropdownItemProps = $props();
</script>

<button
  {onclick}
  class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100 {isActive
    ? 'bg-blue-50 text-blue-600'
    : 'text-gray-700'}"
>
  {#if icon}
    <span class="flex-shrink-0">{@render icon()}</span>
  {/if}
  <span>{@render children()}</span>
</button>
