<script lang="ts">
  import type { Snippet } from 'svelte';

  interface DialogFooterProps {
    children: Snippet;
    class?: string;
  }

  let { children, class: className = '' }: DialogFooterProps = $props();
</script>

<div class="flex justify-end gap-3 border-t border-gray-200 pt-4 {className}">
  {@render children()}
</div>
