<script setup lang="ts">
import { shallowRef } from 'vue';
import { PDFViewer } from '@embedpdf/viewer-vue';
import type { PanelResizeEvent } from '@embedpdf/viewer-vue';

import type { LiveProps, LivePropsRecord } from './live-props';

const { record } = defineProps<{ record: LivePropsRecord }>();

const props = shallowRef<LiveProps>({
  src: '/sample.pdf',
  theme: 'light',
  locale: 'en',
  disable: [],
  readOnly: false,
});
const renders = shallowRef(0);
/** A handler that says the tag it was made with: a stale one would say an old tag. */
const resizeSaying =
  (tag: string) =>
  ({ id, width }: PanelResizeEvent) =>
    record.resized.push(`${tag} ${id} ${width}`);
const onPanelResize = shallowRef(resizeSaying('first'));

record.set = (next) => (props.value = { ...props.value, ...next });
record.setTag = (tag) => (onPanelResize.value = resizeSaying(tag));
record.rerender = () => (renders.value += 1);
</script>

<template>
  <!-- The handler goes in with the props, as `v-bind="config"` gives it: a new function, not one
       the template keeps. `:commands` is a new array on every render: read once, so its change is
       ignored, with a warning. -->
  <PDFViewer
    v-bind="{ ...props, onPanelResize }"
    :data-renders="renders"
    :commands="[{ id: 'acme:hello', label: 'Hello', run: () => {} }]"
    style="height: 100vh; display: block"
    @ready="(viewer) => record.viewers.push(viewer)"
  />
</template>
