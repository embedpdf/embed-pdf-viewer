<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useAnnotationList } from '@embedpdf/vue/annotation';
import type { Annotation } from '@embedpdf/vue/annotation';
import ApprovalStatus from './ApprovalStatus.vue';

// Every approval stamp's status, mounted in the Stage's #overlay slot. Your own
// data for each stamp is kept by its name.
const stamps = useAnnotationList({ subtype: 'stamp' });
const signedOff = reactive<Record<string, boolean>>({ 'approval-budget': true });

// An approval stamp's name, which the stamp keeps in every PDF app; null for any other annotation.
const approvalName = (annotation: Annotation): string | null =>
  annotation.subtype === 'stamp' && annotation.name?.startsWith('approval-')
    ? annotation.name
    : null;

const approvals = computed(() =>
  stamps.value.flatMap((stamp) => {
    const name = approvalName(stamp);
    return name ? [{ name, stamp }] : [];
  }),
);
</script>

<template>
  <ApprovalStatus
    v-for="{ name, stamp } in approvals"
    :key="name"
    :stamp="stamp"
    :signed-off="signedOff[name] ?? false"
    @toggle="signedOff[name] = !signedOff[name]"
  />
</template>
