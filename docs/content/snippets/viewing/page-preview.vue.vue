<script setup lang="ts">
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';
import type { PageRef } from '@embedpdf/vue/runtime';

defineProps<{ page: PageRef }>();
</script>

<template>
  <PageView :page="page" :width="240">
    <RenderLayer />
  </PageView>
</template>
