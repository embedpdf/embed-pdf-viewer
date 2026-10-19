<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { PageRef } from '@embedpdf/vue/runtime';
import { useRender } from '@embedpdf/vue/render';

interface Thumbnail {
  page: PageRef;
  url: string;
}

const render = useRender();
const pages = usePageList();
const thumbnails = shallowRef<Thumbnail[]>([]);
const selected = ref(0);
const preview = ref<string | null>(null);

// A small picture of every page, a few rendered at a time.
watch(
  pages,
  (list, _previous, onCleanup) => {
    const controller = new AbortController();
    const revokes: (() => void)[] = [];
    onCleanup(() => {
      controller.abort();
      revokes.forEach((revoke) => revoke());
    });
    (async () => {
      const { applied } = await render.renderPages(
        list.map((page) => page.ref),
        { width: 120, signal: controller.signal },
      );
      const ready = await Promise.all(
        applied.map(async ({ page, image }) => {
          const { url, revoke } = await image.objectUrl();
          revokes.push(revoke);
          return { page, url };
        }),
      );
      if (!controller.signal.aborted) thumbnails.value = ready;
    })().catch(() => {
      // cancelled: the document closed or the list changed
    });
  },
  { immediate: true },
);

// The chosen page, exactly 640 pixels wide.
watch(
  selected,
  (pageIndex, _previous, onCleanup) => {
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    onCleanup(() => {
      controller.abort();
      revoke?.();
    });
    (async () => {
      const image = await render.renderPage(pageIndex, { width: 640, signal: controller.signal });
      const object = await image.objectUrl();
      if (controller.signal.aborted) {
        object.revoke();
        return;
      }
      revoke = object.revoke;
      preview.value = object.url;
    })().catch(() => {
      // cancelled: another page was picked
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="images">
    <div class="strip" role="listbox" aria-label="Pages">
      <button
        v-for="({ page, url }, index) in thumbnails"
        :key="page.objectNumber"
        type="button"
        role="option"
        class="thumbnail"
        :aria-selected="index === selected"
        @click="selected = index"
      >
        <img :src="url" :alt="`Page ${index + 1}`" />
        <span>{{ index + 1 }}</span>
      </button>
    </div>
    <div class="preview">
      <img v-if="preview" :src="preview" :alt="`Page ${selected + 1}, 640 pixels wide`" />
    </div>
  </div>
</template>
