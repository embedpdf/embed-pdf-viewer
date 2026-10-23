<!--
  The clicked annotation's comment and its replies, in your own card next to it: a note, or any
  mark that carries a comment, such as a highlight. It shows while the annotation is selected.
-->
<script lang="ts">
  import {
    AnnotationMenu,
    annotationKey,
    useAnnotation,
    useAnnotationState,
    useCommentThread,
    useComments,
  } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const comments = useComments();
  const annotations = useAnnotationState();
  const thread = useCommentThread(() =>
    annotations.selected.length === 1 ? annotations.selected[0]!.ref : null,
  );
  let reply = $state('');

  // Escape closes the card, as it ends the selection.
  function close(event: KeyboardEvent) {
    if (event.key === 'Escape') annotation.selection.clear();
  }

  function send(event: SubmitEvent) {
    event.preventDefault();
    if (!thread.current || !reply.trim()) return;
    void comments.reply(thread.current.root.ref, reply.trim());
    reply = '';
  }
</script>

<svelte:window onkeydown={close} />

<!-- No card without a comment to read. -->
{#if thread.current?.root.contents}
  <AnnotationMenu placement="right">
    <article class="note-card">
      <p class="comment">
        <strong>{thread.current.root.author}</strong>
        {thread.current.root.contents}
      </p>
      {#each thread.current.replies as each (annotationKey(each.ref))}
        <p class="comment reply">
          <strong>{each.author}</strong>
          {each.contents}
        </p>
      {/each}
      {#if comments.canReply(thread.current.root.ref)}
        <form class="reply-form" onsubmit={send}>
          <input class="field" aria-label="Reply" placeholder="Reply…" bind:value={reply} />
        </form>
      {/if}
    </article>
  </AnnotationMenu>
{/if}
