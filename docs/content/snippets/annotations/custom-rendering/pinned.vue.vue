<!-- ApprovalStatus.vue -->
<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { annotationKey, useAnnotationAnchor, type Annotation } from '@embedpdf/vue/annotation';
import { useApproval } from './approvals'; // your own data

const props = defineProps<{ stamp: Annotation }>();

// Pinned under the stamp: it stays there while the stamp moves, and scrolls away with it.
const anchor = useAnnotationAnchor(() => props.stamp.ref);
const approval = useApproval(() => annotationKey(props.stamp.ref));
</script>

<template>
  <Anchored :anchor="anchor" placement="bottom" pinned>
    <div class="status">
      {{ approval.signedOff ? 'Signed off' : 'Waiting' }}
      <button @click="approval.toggle">{{ approval.signedOff ? 'Undo' : 'Sign off' }}</button>
    </div>
  </Anchored>
</template>
