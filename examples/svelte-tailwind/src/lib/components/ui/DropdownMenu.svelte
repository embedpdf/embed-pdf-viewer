<script lang="ts">
  import type { Snippet } from 'svelte';

  interface DropdownMenuProps {
    isOpen: boolean;
    onClose: () => void;
    children: Snippet;
    className?: string;
  }

  let { isOpen, onClose, children, className = '' }: DropdownMenuProps = $props();
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-10"
    role="button"
    tabindex="-1"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  ></div>

  <!-- Menu -->
  <div
    class="absolute left-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg {className}"
  >
    {@render children()}
  </div>
{/if}
