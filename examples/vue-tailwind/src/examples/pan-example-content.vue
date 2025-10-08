<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { usePan } from '@embedpdf/plugin-pan/vue';

const { provides: pan, isPanning } = usePan();
</script>

<template>
  <div style="height: 500px" class="select-none">
    <div class="flex h-full flex-col">
      <div
        v-if="pan"
        class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          @click="pan.togglePan"
          :class="[
            'flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-150',
            isPanning
              ? 'border-blue-500 bg-blue-100 text-blue-700'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50',
          ]"
          title="Toggle Pan Tool"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
            <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
            <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
            <path
              d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"
            />
          </svg>
        </button>
      </div>
      <div class="relative flex w-full flex-1 overflow-hidden">
        <GlobalPointerProvider>
          <Viewport class="flex-grow bg-gray-100">
            <Scroller>
              <template #default="{ page }">
                <div
                  :style="{
                    width: page.width + 'px',
                    height: page.height + 'px',
                    position: 'relative',
                  }"
                >
                  <RenderLayer
                    :page-index="page.pageIndex"
                    :scale="page.scale"
                    class="pointer-events-none"
                  />
                </div>
              </template>
            </Scroller>
          </Viewport>
        </GlobalPointerProvider>
      </div>
    </div>
  </div>
</template>
