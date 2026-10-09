<!--
  The pictures of a page's fields, as the engine draws them, from the render
  plugin's shared field pictures. Every state is loaded, so a check box shows
  its new state as soon as its value changes; hidden widgets aren't drawn.
-->
<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { annotationKey, shallowEqual } from '@embedpdf/core';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import type { ShownWidget } from '@embedpdf/plugin-form/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import {
  loadFieldPictureUrls,
  rectInPixels,
  shownFieldPicture,
  type AppearanceUrl,
} from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';

const NO_WIDGETS: readonly ShownWidget[] = Object.freeze([]);

const page = usePage();
const render = useOptionalCapability(RenderToken);
// The same list until a widget on this page changes.
const widgets = useOptionalSelector(
  FormHostToken,
  (form) => form.listShownWidgets(page.value.ref),
  NO_WIDGETS,
  shallowEqual,
);
// Loaded again when the page's fields change, and at appearance-scale crossings.
const epoch = useOptionalSelector(
  RenderToken,
  (lens) => lens.getFieldAppearanceEpoch(page.value.ref),
  0,
);
const scale = useOptionalSelector(
  RenderToken,
  (lens) => lens.getAppearanceScale(page.value.transform.renderScale),
  0,
);

const urls = shallowRef<Record<string, AppearanceUrl>>({});
watch(
  [render, () => page.value.ref, scale, epoch],
  ([lens, pageRef, at], _previous, onCleanup) => {
    if (!lens || !at) return;
    onCleanup(
      loadFieldPictureUrls(
        (signal) => lens.renderFieldAppearances(pageRef, { scale: at, signal }),
        annotationKey,
        (loaded) => (urls.value = loaded),
      ),
    );
  },
  { immediate: true },
);

const pictures = computed(() =>
  widgets.value.flatMap((widget) => {
    const key = annotationKey(widget.ref);
    const picture = shownFieldPicture(urls.value, key, widget.appearanceState);
    return picture
      ? [{ key, url: picture.url, frame: rectInPixels(picture.box, page.value.transform) }]
      : [];
  }),
);
</script>

<template>
  <img
    v-for="picture in pictures"
    :key="picture.key"
    :src="picture.url"
    alt=""
    draggable="false"
    :style="{
      position: 'absolute',
      left: `${picture.frame.left}px`,
      top: `${picture.frame.top}px`,
      width: `${picture.frame.width}px`,
      height: `${picture.frame.height}px`,
      // A global `img { max-width: 100% }` reset would clamp it.
      maxWidth: 'none',
      maxHeight: 'none',
      pointerEvents: 'none',
    }"
  />
</template>
