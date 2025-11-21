<script lang="ts">
  import type { Snippet } from 'svelte';

  interface DialogContentProps {
    children: Snippet;
    class?: string;
  }

  let { children, class: className = '' }: DialogContentProps = $props();
</script>

<div class="space-y-6 {className}">
  {@render children()}
</div>
