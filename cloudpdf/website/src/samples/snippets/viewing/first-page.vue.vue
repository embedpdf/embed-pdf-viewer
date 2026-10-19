<script setup lang="ts">
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';
</script>

<template>
  <PageView :page="0" :width="320">
    <RenderLayer />
  </PageView>
</template>
