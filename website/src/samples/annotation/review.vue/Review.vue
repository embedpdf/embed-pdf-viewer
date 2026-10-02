<!-- A thread's verdict, its check mark, and the buttons the user may use. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useComments } from '@embedpdf/vue/annotation';
import type { CommentThreadView } from '@embedpdf/vue/annotation';

const { thread } = defineProps<{ thread: CommentThreadView }>();

const comments = useComments();
const root = computed(() => thread.root.ref); // the thread's first comment
const verdict = computed(() => thread.review.lastChange?.state ?? 'none');
const marked = computed(() => thread.review.markedBy.length > 0);
</script>

<template>
  <article class="thread">
    <p class="comment">
      <strong>{{ thread.root.author }}</strong> {{ thread.root.contents }}
    </p>
    <p class="verdict">
      <span :class="`state state--${verdict}`">{{ verdict }}</span>
      <span v-if="marked" class="mark">✓ checked off</span>
    </p>
    <div class="actions">
      <button
        type="button"
        class="button"
        :disabled="!comments.canSetStatus(root)"
        @click="comments.setStatus(root, 'accepted')"
      >
        Accept
      </button>
      <button
        type="button"
        class="button"
        :disabled="!comments.canSetStatus(root)"
        @click="comments.setStatus(root, 'rejected')"
      >
        Reject
      </button>
      <button
        type="button"
        class="button"
        :aria-pressed="marked"
        :disabled="!comments.canSetMarked(root)"
        @click="comments.setMarked(root, !marked)"
      >
        ✓
      </button>
      <button
        type="button"
        class="button"
        :disabled="!comments.canDeleteThread(root)"
        @click="comments.deleteThread(root)"
      >
        Delete
      </button>
    </div>
  </article>
</template>
