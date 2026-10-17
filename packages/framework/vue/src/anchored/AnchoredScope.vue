<!--
  <AnchoredScope>: what a page surface wraps around the UI it lets float over
  its pages (the Stage's #overlay slot). Anchored UI inside positions through
  `binding` and sits out the pages not in `shown`. Installed by page surfaces,
  not by app code.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { provideProjector, provideShownPages } from './projector';
import type { ProjectorBinding, ShownPages } from './projector';

const props = defineProps<{
  binding: ProjectorBinding;
  shown: ShownPages;
}>();

defineSlots<{ default?(): unknown }>();

provideProjector(computed(() => props.binding));
provideShownPages(computed(() => props.shown));
</script>

<template>
  <slot />
</template>
