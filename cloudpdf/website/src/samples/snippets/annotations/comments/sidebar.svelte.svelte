<script lang="ts">
  import { annotationKey, useCommentThreads } from '@embedpdf/svelte/annotation';

  const threads = useCommentThreads();
</script>

{#each threads.current as thread (annotationKey(thread.root.ref))}
  <article>
    <p>{thread.root.author}, page {thread.pageLabel}: {thread.root.contents}</p>
    {#each thread.replies as reply (annotationKey(reply.ref))}
      <p>{reply.author}: {reply.contents}</p>
    {/each}
  </article>
{/each}
