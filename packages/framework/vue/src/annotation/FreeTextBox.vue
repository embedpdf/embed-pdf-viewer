<!--
  A free text annotation's text: the same styled element for reading and for
  typing, placed on the engine's text plate (the box inset by its padding).
  The editor binding owns what's inside it, so the template renders nothing
  there, and the element lives as long as the text box does (keyed by its id),
  so the caret never jumps while someone types. Focus and `contentEditable`
  follow the plugin's `editing`.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { TextItem } from '@embedpdf/plugin-annotation';
import { annotationChromePaint, textBoxStyleOf, textPlateInPixels } from '@embedpdf/web';
import { useViewerSettings } from '../runtime/documents';
import type { PageContextValue } from '../runtime/page';
import { useAnnotationSettings } from './state';
import { useTextBoxEditor } from './text-box';

const props = defineProps<{ item: TextItem; page: PageContextValue }>();

// The element is the engine's text plate: the box inset by its padding.
const plate = computed(() => textPlateInPixels(props.item, props.page.transform));
const element = useTextBoxEditor(
  () => props.item,
  () => plate.value.scale,
);

const chrome = useAnnotationSettings((settings) => settings.chrome);
const accent = useViewerSettings((settings) => settings.accent);
const outline = computed(() => annotationChromePaint(chrome.value, accent.value).textOutline);

const style = computed((): CSSProperties => {
  const { item } = props;
  const { left, top, width, height, scale } = plate.value;
  return {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    // Fixed to the plate: the box never grows with its text; it scrolls while
    // typing and clips otherwise, where the baked appearance clips.
    height: `${height}px`,
    ...textBoxStyleOf(item.css, scale),
    boxSizing: 'border-box',
    // The box's fill and border are the vector scene's, under this layer.
    background: 'transparent',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    overflowY: item.editing ? 'auto' : 'hidden',
    overflowX: 'hidden',
    outline: item.editing ? `1px solid ${outline.value}` : 'none',
    cursor: item.editing ? 'text' : 'default',
    // A plain text box turns about its centre, as the baked appearance does.
    ...(item.rot ? { transform: `rotate(${item.rot}deg)`, transformOrigin: 'center' } : {}),
    // Not typing: clicks fall through to the shapes (select, move, resize).
    pointerEvents: item.editing ? 'auto' : 'none',
  };
});
</script>

<template>
  <div ref="element" :style="style" />
</template>
