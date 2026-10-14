<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { useAnnotationAnchor } from '@embedpdf/vue/annotation';
import type { Annotation } from '@embedpdf/vue/annotation';

// One stamp's status, pinned to it: a check on its corner once it's signed off,
// and a status with a button under it. Both stay there while the stamp moves.
const props = defineProps<{ stamp: Annotation; signedOff: boolean }>();
defineEmits<{ toggle: [] }>();

const anchor = useAnnotationAnchor(() => props.stamp.ref);
</script>

<template>
  <Anchored v-if="signedOff" :anchor="anchor" placement="top-end" :gap="-12" pinned>
    <span class="check">✓</span>
  </Anchored>
  <Anchored :anchor="anchor" placement="bottom" :gap="8" pinned>
    <div class="status">
      <span :class="['dot', { 'dot--done': signedOff }]" />
      {{ signedOff ? 'Signed off' : 'Waiting' }}
      <button type="button" :class="['sign', { 'sign--undo': signedOff }]" @click="$emit('toggle')">
        {{ signedOff ? 'Undo' : 'Sign off' }}
      </button>
    </div>
  </Anchored>
</template>
