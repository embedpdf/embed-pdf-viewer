<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { PageView } from '@embedpdf/vue/page-view';
import { RenderLayer } from '@embedpdf/vue/render';

const pages = usePageList();
const picked = shallowRef<PageRef | null>(null);
// A ref follows its page when pages move, so it's what you keep.
const shown = computed(() => picked.value ?? pages.value[0]?.ref ?? null);
</script>

<template>
  <div class="picker">
    <div class="choices" role="listbox" aria-label="Pages">
      <button
        v-for="page in pages"
        :key="page.ref.objectNumber"
        type="button"
        role="option"
        class="choice"
        :aria-selected="page.ref.objectNumber === shown?.objectNumber"
        @click="picked = page.ref"
      >
        <PageView :page="page.ref" :width="84">
          <RenderLayer />
        </PageView>
        <span class="number">{{ page.label ?? page.index + 1 }}</span>
      </button>
    </div>
    <div class="shown">
      <PageView v-if="shown" :page="shown" :width="300">
        <RenderLayer />
      </PageView>
    </div>
  </div>
</template>
