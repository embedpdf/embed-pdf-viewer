<script setup lang="ts">
import { computed, ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput, PageContextValue } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import Controls from './Controls.vue';
import type { Pin } from './pin';

import '../pins.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// One pin to start with: an inch in from the first page's top-left corner.
const pins = ref<Pin[]>([{ pageIndex: 0, point: { x: 72, y: 72 } }]);
const last = computed(() => pins.value[pins.value.length - 1] ?? null);
// Where the pointer went down: a press that moved was a drag to scroll, not a click.
let pressed = { x: 0, y: 0 };

function press(event: PointerEvent) {
  pressed = { x: event.clientX, y: event.clientY };
}

function drop(page: PageContextValue, event: MouseEvent) {
  const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
  if (moved > 4) return;
  // A pointer event, to a point on the page.
  const point = page.toPagePoint(event.clientX, event.clientY);
  pins.value = [...pins.value, { pageIndex: page.pageIndex, point }];
}
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Controls :last="last" @clear="pins = []" />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
        <!--
          What's drawn here sits over the page and never turns with it, so it
          converts with pageToView, which includes the turn.
        -->
        <template #page-chrome="{ page }">
          <div class="surface" @pointerdown="press" @click="drop(page, $event)">
            <!-- Many things at once: the browser maps page points with one matrix. -->
            <div
              v-if="page.pageIndex === 0"
              class="page-space"
              :style="{ transform: page.transform.cssMatrix }"
            >
              <div class="inch">1 inch</div>
            </div>
            <!-- A point on the page, to pixels on it: at the last moment. -->
            <div
              v-for="(pin, index) in pins.filter((pin) => pin.pageIndex === page.pageIndex)"
              :key="index"
              class="pin"
              :style="{
                left: `${page.transform.pageToView(pin.point).x}px`,
                top: `${page.transform.pageToView(pin.point).y}px`,
              }"
            />
          </div>
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
