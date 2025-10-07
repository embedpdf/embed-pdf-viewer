<script setup lang="ts">
import { computed } from 'vue';
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';

const { provides: scroll, state } = useScroll();

const getIsActive = (pageIndex: number) =>
  computed(() => state.value.currentPage === pageIndex + 1);

const handleClick = (pageIndex: number) => {
  scroll.value?.scrollToPage({
    pageNumber: pageIndex + 1,
    behavior: 'smooth',
  });
};
</script>

<template>
  <div class="sidebar">
    <ThumbnailsPane class="thumbs-viewport" :style="{ width: '100%', height: '100%' }">
      <template #default="{ meta }">
        <div
          class="thumb-row"
          :class="{ active: getIsActive(meta.pageIndex).value }"
          :style="{
            position: 'absolute',
            top: meta.top + 'px',
            left: 0,
            right: 0,
            height: meta.wrapperHeight + 'px',
          }"
          @click="handleClick(meta.pageIndex)"
        >
          <div
            class="thumb-img-wrapper"
            :style="{
              padding: (meta.padding || 0) + 'px',
              boxSizing: 'content-box',
            }"
          >
            <ThumbImg
              class="thumb-img"
              :meta="meta"
              :style="{
                width: meta.width + 'px',
                height: meta.height + 'px',
                display: 'block',
              }"
            />
          </div>
          <div class="thumb-label" :style="{ height: meta.labelHeight + 'px' }">
            Page {{ meta.pageIndex + 1 }}
          </div>
        </div>
      </template>
    </ThumbnailsPane>
  </div>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.thumbs-viewport {
  position: relative;
}

.thumb-row {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

.thumb-row:hover {
  background: rgba(0, 0, 0, 0.04);
}

.thumb-row.active {
  background: rgba(17, 132, 255, 0.1);
  background: color-mix(in srgb, var(--q-primary) 15%, transparent);
  border-left-color: var(--q-primary);
}

.thumb-img-wrapper {
  border-radius: 2px;
  overflow: hidden;
}

.thumb-img {
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08) inset,
    0 1px 2px rgba(0, 0, 0, 0.12);
}

.thumb-label {
  font-size: 12px;
  line-height: 16px;
  color: rgba(0, 0, 0, 0.54);
}
</style>
