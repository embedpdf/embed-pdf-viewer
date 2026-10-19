<!-- Catches what its content throws while it's created or updated, and shows the message. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:boundary>
  {@render children()}
  {#snippet failed(error)}
    <div data-testid="caught">{error instanceof Error ? error.message : String(error)}</div>
  {/snippet}
</svelte:boundary>
