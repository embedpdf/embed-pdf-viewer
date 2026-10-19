<!-- src/routes/contract/+page.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import DocumentViewer from '$lib/DocumentViewer.svelte';
</script>

{#if browser}
  <DocumentViewer />
{:else}
  <div style="height: 600px">Loading the viewer…</div>
{/if}
