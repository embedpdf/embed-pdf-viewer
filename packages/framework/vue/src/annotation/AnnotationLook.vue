<!--
  Your look for one annotation, inside its frame: your renderer's component,
  drawn at the annotation's 100% size and scaled with the page, unless the
  renderer opts out (`scale: false`) and draws at its size on screen.
  `useRichTextEditor()` inside it divides by that scale.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { Component, CSSProperties } from 'vue';
import type { RenderItem } from '@embedpdf/core-annotation';
import type { Annotation } from '@embedpdf/plugin-annotation';
import { frameInPixels, lookFrameOf } from '@embedpdf/web';
import type { PageContextValue } from '../runtime/page';
import { provideLookScale } from './text-box';

const props = defineProps<{
  /** Your renderer's component. */
  component: Component;
  /** Draw at the annotation's 100% size and let the layer scale it (the default), or at its size on screen. */
  scaled: boolean;
  annotation: Annotation;
  item: RenderItem;
  page: PageContextValue;
  native: Component;
  appearance: { url: string } | null;
  interactive: boolean;
}>();

const pixels = computed(() => frameInPixels(props.item.frame, props.page.transform));
const frame = computed(() => lookFrameOf(pixels.value, props.scaled));
// What `useRichTextEditor()` in the look divides by: 1 when it draws at its size on screen.
provideLookScale(computed(() => (props.scaled ? pixels.value.scale : 1)));

const scaledBox = computed(
  (): CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: `${pixels.value.design.width}px`,
    height: `${pixels.value.design.height}px`,
    transform: `scale(${pixels.value.scale})`,
    transformOrigin: '0 0',
  }),
);
</script>

<template>
  <div v-if="scaled" :style="scaledBox">
    <component
      :is="component"
      :annotation="annotation"
      :frame="frame"
      :native="native"
      :appearance="appearance"
      :hovered="item.hovered ?? false"
      :selected="item.selected"
      :interactive="interactive"
    />
  </div>
  <component
    :is="component"
    v-else
    :annotation="annotation"
    :frame="frame"
    :native="native"
    :appearance="appearance"
    :hovered="item.hovered ?? false"
    :selected="item.selected"
    :interactive="interactive"
  />
</template>
