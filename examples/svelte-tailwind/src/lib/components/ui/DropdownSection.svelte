<script lang="ts">
  import type { Snippet } from 'svelte';

  interface DropdownSectionProps {
    title?: string;
    children: Snippet;
  }

  let { title, children }: DropdownSectionProps = $props();
</script>

{#if title}
  <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
    {title}
  </div>
{/if}
{@render children()}
