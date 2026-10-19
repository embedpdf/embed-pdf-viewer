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
import type { TextItem } from '@embedpdf/plugin-annotation';
import { annotationChromePaint, freeTextBoxOf } from '@embedpdf/web';
import { useViewerSettings } from '../runtime/documents';
import type { PageContextValue } from '../runtime/page';
import { useAnnotationSettings } from './state';
import { useTextBoxEditor } from './text-box';

const props = defineProps<{ item: TextItem; page: PageContextValue }>();

const chrome = useAnnotationSettings((settings) => settings.chrome);
const accent = useViewerSettings((settings) => settings.accent);
const outline = computed(() => annotationChromePaint(chrome.value, accent.value).textOutline);

// On the engine's text plate (the box inset by its padding), laid out at a legible size.
const box = computed(() => freeTextBoxOf(props.item, props.page.transform, outline.value));
const element = useTextBoxEditor(
  () => props.item,
  () => box.value.scale,
);
</script>

<template>
  <div ref="element" :style="box.style" />
</template>
