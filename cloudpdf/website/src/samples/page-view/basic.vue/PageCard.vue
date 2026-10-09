<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';

// A card that shows one page, like a preview next to a search result or a comment.
const pages = usePageList();
const index = ref(0);
const page = computed(() => pages.value[index.value]);
</script>

<template>
  <figure class="card">
    <PageView :page="index" :width="220" class="page">
      <RenderLayer />
    </PageView>
    <figcaption class="caption">
      <strong class="title">Page {{ page?.label ?? index + 1 }}</strong>
      <span v-if="page" class="detail">
        {{ Math.round(page.size.width) }} × {{ Math.round(page.size.height) }} points
      </span>
      <span class="pager">
        <button type="button" class="button" :disabled="index === 0" @click="index -= 1">
          ‹ Previous
        </button>
        <button
          type="button"
          class="button"
          :disabled="index >= pages.length - 1"
          @click="index += 1"
        >
          Next ›
        </button>
      </span>
    </figcaption>
  </figure>
</template>
