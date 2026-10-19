<!-- One thread: the first comment, its replies, a reply box, and a button that shows it. -->
<script lang="ts">
  import { useStage } from '@embedpdf/svelte/stage';
  import {
    annotationKey,
    useAnnotation,
    useComments,
    type CommentThreadView,
  } from '@embedpdf/svelte/annotation';

  let { thread }: { thread: CommentThreadView } = $props();

  const comments = useComments();
  const annotation = useAnnotation();
  const stage = useStage();
  let text = $state('');

  function show() {
    stage.reveal(thread.page, { rect: thread.root.rect });
    annotation.selection.set([thread.root.ref]); // and select it
  }

  function reply(event: SubmitEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    void comments.reply(thread.root.ref, text.trim());
    text = '';
  }
</script>

<article class="thread">
  <header class="thread-head">
    <span class="where">Page {thread.pageLabel}</span>
    <button type="button" class="show" onclick={show}>Show</button>
  </header>
  <p class="comment">
    <strong>{thread.root.author}</strong>
    {thread.root.contents}
  </p>
  {#each thread.replies as each (annotationKey(each.ref))}
    <p class="comment reply">
      <strong>{each.author}</strong>
      {each.contents}
    </p>
  {/each}
  {#if comments.canReply(thread.root.ref)}
    <form class="reply-form" onsubmit={reply}>
      <input class="field" aria-label="Reply" placeholder="Reply…" bind:value={text} />
    </form>
  {/if}
</article>
