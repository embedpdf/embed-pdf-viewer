<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { type Annotation, useAnnotationAnchor, useCommentThread } from '@embedpdf/vue/annotation';

const props = defineProps<{ note: Annotation }>();

const anchor = useAnnotationAnchor(() => props.note.ref);
const thread = useCommentThread(() => props.note.ref);
</script>

<template>
  <Anchored :anchor="anchor" placement="right" :gap="4" pinned>
    <span class="badge">{{ thread?.replies.length ?? 0 }}</span>
  </Anchored>
</template>
