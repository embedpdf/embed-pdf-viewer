<script lang="ts">
  import { useSurface } from '@embedpdf/svelte/shell';
  import CommentList from './CommentList.svelte';

  const panel = useSurface('comments');
</script>

<button onclick={() => panel.toggle({ exclusive: 'right' })}>Comments</button>

{#if panel.isOpen}
  <aside>
    <button onclick={panel.close}>Close</button>
    <CommentList />
  </aside>
{/if}
