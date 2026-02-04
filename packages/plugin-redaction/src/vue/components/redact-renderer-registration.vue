<script setup lang="ts">
import { useRegisterRenderers } from '@embedpdf/plugin-annotation/vue';
import { redactRenderers } from './redact-renderers';

/**
 * Utility component that registers redact renderers once at app level.
 * Added via addUtility() so it mounts once, not per-page.
 */
useRegisterRenderers(redactRenderers);
</script>

<template>
  <slot />
</template>
