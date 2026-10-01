<!--
  ApprovalStamp.vue, the component of this renderer:
  { for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovalStamp,
    interactive: ({ toolId }) => toolId === 'pan' }
-->
<script setup lang="ts">
import { computed } from 'vue';
import { annotationKey, type AnnotationRendererProps } from '@embedpdf/vue/annotation';
import StatusDot from './StatusDot.vue';
import { useApproval } from './approvals'; // your own data

const props = defineProps<AnnotationRendererProps>();
const approval = useApproval(annotationKey(props.annotation.ref));
const rect = computed(() => props.page.transform.pageToViewRect(props.box));
</script>

<template>
  <component :is="native" />
  <div
    :style="{
      position: 'absolute',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    }"
  >
    <StatusDot :status="approval.status" />
    <button v-if="interactive" @click="approval.open">Details</button>
  </div>
</template>
