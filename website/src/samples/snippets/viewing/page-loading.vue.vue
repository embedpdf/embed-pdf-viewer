<!-- PageLoading.vue: put <PageLoading /> in each page, after <RenderLayer /> -->
<script setup lang="ts">
import { usePictureState } from '@embedpdf/vue/render';

const picture = usePictureState();
</script>

<template>
  <div
    v-if="picture.status === 'loading' && picture.slow"
    class="page-loading"
    role="status"
    aria-label="Loading page"
  />
  <p v-else-if="picture.status === 'error'" class="page-error">This page couldn't load.</p>
</template>
