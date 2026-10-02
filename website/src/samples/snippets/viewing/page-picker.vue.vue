<script setup lang="ts">
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';
import { usePageList, type PageRef } from '@embedpdf/vue/runtime';

const emit = defineEmits<{ pick: [page: PageRef] }>();
const pages = usePageList();
</script>

<template>
  <button v-for="page in pages" :key="page.index" @click="emit('pick', page.ref)">
    <PageView :page="page.ref" :width="120">
      <RenderLayer />
    </PageView>
    {{ page.label ?? page.index + 1 }}
  </button>
</template>
