<script setup lang="ts">
import { provideRendererRegistry } from '../context';

/**
 * Provider component that sets up the annotation renderer registry.
 * Used as a wrapper via createPluginPackage().addWrapper().
 */
provideRendererRegistry();
</script>

<template>
  <slot />
</template>
