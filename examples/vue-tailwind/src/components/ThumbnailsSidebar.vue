<template>
  <div class="flex h-full flex-col bg-gray-50">
    <!-- Thumbnails -->
    <div class="flex-1 overflow-hidden">
      <ThumbnailsPane :documentId="props.documentId" :style="{ width: '100%', height: '100%' }">
        <template #default="{ meta }">
          <div
            :style="{
              position: 'absolute',
              width: '100%',
              height: meta.wrapperHeight + 'px',
              top: meta.top + 'px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '8px',
            }"
            @click="handleClick(meta.pageIndex)"
          >
            <div
              :style="{
                width: meta.width + 'px',
                height: meta.height + 'px',
                border: `2px solid ${getIsActive(meta.pageIndex).value ? '#3b82f6' : '#d1d5db'}`,
                borderRadius: '4px',
                overflow: 'hidden',
                boxShadow: getIsActive(meta.pageIndex).value
                  ? '0 0 0 2px rgba(59, 130, 246, 0.2)'
                  : 'none',
              }"
            >
              <ThumbImg
                :documentId="props.documentId"
                :meta="meta"
                style="width: 100%; height: 100%; object-fit: contain"
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
              <span class="text-xs text-gray-600">{{ meta.pageIndex + 1 }}</span>
            </div>
          </div>
        </template>
      </ThumbnailsPane>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/vue';
import { useScroll } from '@embedpdf/plugin-scroll/vue';
import { CloseIcon } from './icons';

const props = defineProps<{
  documentId: string;
  onClose: () => void;
}>();

const { state, provides } = useScroll(() => props.documentId);

const getIsActive = (pageIndex: number) =>
  computed(() => state.value.currentPage === pageIndex + 1);

const handleClick = (pageIndex: number) => {
  provides.value?.scrollToPage({
    pageNumber: pageIndex + 1, // 1-based
    behavior: 'smooth',
  });
};
</script>
