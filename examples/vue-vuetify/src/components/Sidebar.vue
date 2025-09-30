<script setup lang="ts">
import { computed } from 'vue';
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';

const { provides: scroll, state } = useScroll();

const getIsActive = (pageIndex: number) =>
  computed(() => state.value.currentPage === pageIndex + 1);

const handleClick = (pageIndex: number) => {
  scroll.value?.scrollToPage({
    pageNumber: pageIndex + 1, // 1-based
    behavior: 'smooth',
  });
};
</script>

<template>
  <div class="sidebar">
    <ThumbnailsPane :style="{ width: '100%', height: '100%' }" class="thumbs-viewport">
      <template #default="{ meta }">
        <!-- absolute-positioned row inside the virtualized pane -->
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
              /* outer box still uses the plugin width (meta.width + padding*2) */
              padding: (meta.padding || 0) + 'px',
              boxSizing: 'content-box', // ensures we keep the intended outer width
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

/* Scroll container lives inside ThumbnailsPane; we just size it via props */
.thumbs-viewport {
  position: relative;
}

/* One row per thumb (image + label) */
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

/* Active page highlight */
.thumb-row.active {
  background: rgba(var(--v-theme-primary), 0.1);
  border-left-color: rgb(var(--v-theme-primary));
}

/* Thumbnail image box */
.thumb-img-wrapper {
  border-radius: 2px;
  overflow: hidden;
}

.thumb-img {
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08) inset,
    0 1px 2px rgba(0, 0, 0, 0.12);
}

/* Label under each image */
.thumb-label {
  font-size: 12px;
  line-height: 16px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
