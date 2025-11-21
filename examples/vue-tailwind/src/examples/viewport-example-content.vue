<script setup lang="ts">
import {
  Viewport,
  useViewportCapability,
  useViewportScrollActivity,
} from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { computed } from 'vue';

const props = defineProps<{
  documentId: string;
}>();

const { provides: viewportCapability } = useViewportCapability();
const scrollActivity = useViewportScrollActivity(() => props.documentId);

const viewport = computed(() => viewportCapability.value?.forDocument(props.documentId));

const scrollToTop = () => {
  viewport.value?.scrollTo({ x: 0, y: 0, behavior: 'smooth' });
};

const scrollToMiddle = () => {
  if (!viewport.value) return;
  const metrics = viewport.value.getMetrics();
  viewport.value.scrollTo({
    y: metrics.scrollHeight / 2,
    x: 0,
    behavior: 'smooth',
    center: true,
  });
};

const scrollToBottom = () => {
  if (!viewport.value) return;
  const metrics = viewport.value.getMetrics();
  viewport.value.scrollTo({ y: metrics.scrollHeight, x: 0, behavior: 'smooth' });
};
</script>

<template>
  <div style="height: 500px">
    <div class="flex h-full flex-col">
      <div
        class="mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <div class="flex items-center gap-2">
          <button
            @click="scrollToTop"
            :disabled="!viewport"
            class="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
          >
            Scroll to Top
          </button>
          <button
            @click="scrollToMiddle"
            :disabled="!viewport"
            class="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
          >
            Scroll to Middle
          </button>
          <button
            @click="scrollToBottom"
            :disabled="!viewport"
            class="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 disabled:opacity-50"
          >
            Scroll to Bottom
          </button>
        </div>
        <div class="h-6 w-px bg-gray-200"></div>
        <div class="flex items-center">
          <div
            :class="[
              'h-3 w-3 rounded-full transition-colors duration-200',
              scrollActivity.isScrolling ? 'bg-green-500' : 'bg-gray-300',
            ]"
          ></div>
          <span class="ml-2 min-w-[100px] text-sm font-medium text-gray-600">
            {{ scrollActivity.isScrolling ? 'Scrolling...' : 'Idle' }}
          </span>
        </div>
      </div>
      <div class="relative flex w-full flex-1 overflow-hidden">
        <Viewport :document-id="documentId" class="flex-grow bg-gray-100">
          <Scroller :document-id="documentId">
            <template #default="{ page }">
              <div
                :style="{
                  width: page.width + 'px',
                  height: page.height + 'px',
                  position: 'relative',
                }"
              >
                <RenderLayer :document-id="documentId" :page-index="page.pageIndex" :scale="1" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
