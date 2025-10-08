<script setup lang="ts">
import { ref } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { RedactionLayer, RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/vue';

const { state, provides } = useRedaction();
const isCommitting = ref(false);

const handleApplyAll = () => {
  if (!provides.value || isCommitting.value) return;
  isCommitting.value = true;
  provides.value.commitAllPending().wait(
    () => {
      isCommitting.value = false;
    },
    () => {
      isCommitting.value = false;
    },
  );
};
</script>

<template>
  <div style="height: 600px; display: flex; flex-direction: column; user-select: none">
    <div
      class="mb-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
    >
      <button
        @click="provides?.toggleRedactSelection()"
        :class="[
          'rounded-md px-3 py-1 text-sm font-medium transition-colors',
          state.activeType === RedactionMode.RedactSelection
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200',
        ]"
      >
        Mark Text
      </button>
      <button
        @click="provides?.toggleMarqueeRedact()"
        :class="[
          'rounded-md px-3 py-1 text-sm font-medium transition-colors',
          state.activeType === RedactionMode.MarqueeRedact
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200',
        ]"
      >
        Mark Area
      </button>
      <div class="h-6 w-px bg-gray-200"></div>
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-600"
          >{{ state.pendingCount }} marks pending</span
        >
        <button
          @click="handleApplyAll"
          :disabled="state.pendingCount === 0 || isCommitting"
          class="rounded-md bg-red-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {{ isCommitting ? 'Applying...' : 'Apply All' }}
        </button>
      </div>
    </div>
    <div style="flex: 1; overflow: hidden; position: relative">
      <Viewport
        style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #f1f3f5"
      >
        <Scroller>
          <template #default="{ page }">
            <PagePointerProvider
              :page-index="page.pageIndex"
              :page-width="page.width"
              :page-height="page.height"
              :rotation="page.rotation"
              :scale="page.scale"
            >
              <RenderLayer :page-index="page.pageIndex" style="pointer-events: none" />
              <SelectionLayer :page-index="page.pageIndex" :scale="page.scale" />
              <RedactionLayer
                :page-index="page.pageIndex"
                :scale="page.scale"
                :rotation="page.rotation"
              >
                <template #selection-menu="props">
                  <div v-if="props.selected" v-bind="props.menuWrapperProps">
                    <div
                      class="flex cursor-default gap-2 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
                      :style="{
                        position: 'absolute',
                        top: props.rect.size.height + 10 + 'px',
                        left: 0,
                        pointerEvents: 'auto',
                      }"
                    >
                      <button
                        @click="provides?.commitPending(props.item.page, props.item.id)"
                        class="rounded-md bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600 active:bg-red-700"
                      >
                        Apply
                      </button>
                      <button
                        @click="provides?.removePending(props.item.page, props.item.id)"
                        class="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 active:bg-gray-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </template>
              </RedactionLayer>
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
