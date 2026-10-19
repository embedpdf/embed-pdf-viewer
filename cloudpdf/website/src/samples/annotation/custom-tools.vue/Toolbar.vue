<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// A toolbar that builds itself from the tools: every tool with a label gets a button.
const annotation = useAnnotation();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const ready = useAnnotationState((state) => state.status === 'ready');
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);
const labelled = computed(() =>
  annotation.tools.list().filter((tool) => typeof tool.meta?.label === 'string'),
);
let added = false;

// On load: an arrow drawn with the arrow tool's defaults, and the arrow tool active.
watch(
  [ready, cover],
  ([isReady, page]) => {
    if (!isReady || !page || added) return;
    added = true;
    void annotation.create(
      page,
      { subtype: 'line', linePoints: { start: { x: 520, y: 120 }, end: { x: 470, y: 230 } } },
      undefined,
      { tool: 'arrow' },
    );
    interaction.activateTool('arrow');
  },
  { immediate: true },
);
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Tool">
      <button
        type="button"
        :aria-pressed="activeToolId === 'pointer'"
        @click="interaction.activateTool('pointer')"
      >
        Select
      </button>
      <button
        v-for="tool in labelled"
        :key="tool.id"
        type="button"
        :aria-pressed="activeToolId === tool.id"
        @click="interaction.activateTool(tool.id)"
      >
        {{ String(tool.meta?.label) }}
      </button>
    </div>
  </div>
</template>
