<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/vue';

const { state, provides } = useScroll();
</script>

<template>
  <div style="height: 500px; margin-top: 10px">
    <div style="display: flex; height: 100%">
      <div
        style="
          width: 150px;
          height: 100%;
          background-color: #f8f9fa;
          border-right: 1px solid #dee2e6;
        "
      >
        <ThumbnailsPane>
          <template #default="{ meta }">
            <div
              :key="meta.pageIndex"
              :style="{
                position: 'absolute',
                width: '100%',
                height: meta.wrapperHeight + 'px',
                top: meta.top + 'px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '4px',
              }"
              @click="provides?.scrollToPage?.({ pageNumber: meta.pageIndex + 1 })"
            >
              <div
                :style="{
                  width: meta.width + 'px',
                  height: meta.height + 'px',
                  border: `2px solid ${state.currentPage === meta.pageIndex + 1 ? '#0d6efd' : '#ced4da'}`,
                  borderRadius: '4px',
                  overflow: 'hidden',
                  boxShadow:
                    state.currentPage === meta.pageIndex + 1
                      ? '0 0 5px rgba(13, 110, 253, 0.5)'
                      : 'none',
                }"
              >
                <ThumbImg
                  :meta="meta"
                  :style="{ width: '100%', height: '100%', objectFit: 'contain' }"
                />
              </div>
              <div
                :style="{
                  height: meta.labelHeight + 'px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '4px',
                }"
              >
                <span style="font-size: 12px; color: #6c757d">{{ meta.pageIndex + 1 }}</span>
              </div>
            </div>
          </template>
        </ThumbnailsPane>
      </div>
      <div style="flex: 1; overflow: hidden; position: relative">
        <Viewport
          style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #f1f3f5;
          "
        >
          <Scroller>
            <template #default="{ page }">
              <div
                :style="{
                  width: page.width + 'px',
                  height: page.height + 'px',
                  position: 'relative',
                }"
              >
                <RenderLayer :page-index="page.pageIndex" :scale="page.scale" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
