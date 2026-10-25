<!--
  The clicked annotation's comment and its replies, in your own card next to it: a note, or any
  mark that carries a comment, such as a highlight. It shows while the annotation is selected.
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  AnnotationMenu,
  annotationKey,
  useAnnotation,
  useAnnotationState,
  useCommentThread,
  useComments,
} from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const comments = useComments();
const { selected } = useAnnotationState();
// No card without a comment to read: the template checks `thread?.root.contents`.
const thread = useCommentThread(() =>
  selected.value.length === 1 ? selected.value[0]!.ref : null,
);
const reply = ref('');

// Escape closes the card, as it ends the selection.
function close(event: KeyboardEvent) {
  if (event.key === 'Escape') annotation.selection.clear();
}

onMounted(() => window.addEventListener('keydown', close));
onUnmounted(() => window.removeEventListener('keydown', close));

function send() {
  if (!thread.value || !reply.value.trim()) return;
  void comments.reply(thread.value.root.ref, reply.value.trim());
  reply.value = '';
}
</script>

<template>
  <AnnotationMenu v-if="thread?.root.contents" placement="right">
    <article class="note-card">
      <p class="comment">
        <strong>{{ thread.root.author }}</strong> {{ thread.root.contents }}
      </p>
      <p v-for="each in thread.replies" :key="annotationKey(each.ref)" class="comment reply">
        <strong>{{ each.author }}</strong> {{ each.contents }}
      </p>
      <form v-if="comments.canReply(thread.root.ref)" class="reply-form" @submit.prevent="send">
        <input v-model="reply" class="field" aria-label="Reply" placeholder="Reply…" />
      </form>
    </article>
  </AnnotationMenu>
</template>
