<!--
  <StageScope :token>: binds its content to a stage lens, so the stage
  composables and stage chrome inside use `token` unless they are handed one.
-->
<script setup lang="ts">
import { provideStageToken } from './scope';
import type { StageTokenProp } from './scope';

const props = defineProps<{
  /** The lens: a second view's token, from `createCapabilityToken`. */
  token: StageTokenProp;
}>();

defineSlots<{ default?(): unknown }>();

provideStageToken(() => props.token);
</script>

<template>
  <slot />
</template>
