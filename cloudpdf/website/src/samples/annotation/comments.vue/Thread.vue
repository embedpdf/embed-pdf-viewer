<!-- One thread: the first comment, its replies, a reply box, and a button that shows it. -->
<script setup lang="ts">
import { ref } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { annotationKey, useAnnotation, useComments } from '@embedpdf/vue/annotation';
import type { CommentThreadView } from '@embedpdf/vue/annotation';

const { thread } = defineProps<{ thread: CommentThreadView }>();

const comments = useComments();
const annotation = useAnnotation();
const stage = useStage();
const text = ref('');

function show() {
  stage.reveal(thread.page, { rect: thread.root.rect });
  annotation.selection.set([thread.root.ref]); // and select it
}

function reply() {
  if (!text.value.trim()) return;
  void comments.reply(thread.root.ref, text.value.trim());
  text.value = '';
}
</script>

<template>
  <article class="thread">
    <header class="thread-head">
      <span class="where">Page {{ thread.pageLabel }}</span>
      <button type="button" class="show" @click="show">Show</button>
    </header>
    <p class="comment">
      <strong>{{ thread.root.author }}</strong> {{ thread.root.contents }}
    </p>
    <p v-for="each in thread.replies" :key="annotationKey(each.ref)" class="comment reply">
      <strong>{{ each.author }}</strong> {{ each.contents }}
    </p>
    <form v-if="comments.canReply(thread.root.ref)" class="reply-form" @submit.prevent="reply">
      <input v-model="text" class="field" aria-label="Reply" placeholder="Reply…" />
    </form>
  </article>
</template>
