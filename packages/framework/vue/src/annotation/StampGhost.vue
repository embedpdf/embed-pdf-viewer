<!--
  The armed stamp's ghost: a see-through render of the stamp, in the exact box
  a click would place it (the plugin computes it with the same fit and clamp
  as the placement). Every other tool's ghost is a render item, drawn like a
  drawing in progress. The preview bytes live in the plugin; this owns only
  the object URL, keyed on the armed stamp: a new arm swaps the image, a
  disarm (or another tool) drops it.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import {
  AnnotationToken as AnnotationHostToken,
  previewBucket,
} from '@embedpdf/plugin-annotation/contract/host';
import { ghostOpacity, loadObjectUrl, rectInPixels } from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import type { PageContextValue } from '../runtime/page';

const props = defineProps<{ page: PageContextValue }>();

const annotation = useOptionalCapability(AnnotationHostToken);
const ghost = useOptionalSelector(
  AnnotationHostToken,
  (host) => host.getImageGhost(props.page.ref),
  null,
);
const armed = useOptionalSelector(AnnotationHostToken, (host) => host.getArmedStamp(), null);
// The ghost is a bitmap of vector artwork, right at one size: ask for the
// bucket that covers the box's device width (points × device pixels per
// point), so it stays sharp at every zoom and density. The plugin caches per
// bucket.
const bucket = computed(() =>
  ghost.value ? previewBucket(ghost.value.box.width * props.page.transform.renderScale) : 0,
);

const url = ref<string | null>(null);
watch(
  [annotation, armed, bucket],
  ([host, _armed, size], _previous, onCleanup) => {
    if (!host || !size) {
      url.value = null;
      return;
    }
    // The previous bucket's image stays up until this one arrives: no flicker
    // while a zoom crosses a bucket boundary.
    onCleanup(
      loadObjectUrl(
        () => host.renderArmedStampPreview(size),
        (next) => (url.value = next),
      ),
    );
  },
  { immediate: true },
);

const style = computed((): CSSProperties | null => {
  const current = ghost.value;
  if (!current) return null;
  const frame = rectInPixels(current.box, props.page.transform);
  return {
    position: 'absolute',
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    // Never let a global `img` reset clamp the box and distort the aspect.
    maxWidth: 'none',
    maxHeight: 'none',
    pointerEvents: 'none',
    opacity: ghostOpacity(current.opacity),
    ...(current.rot ? { transform: `rotate(${current.rot}deg)`, transformOrigin: 'center' } : {}),
  };
});
</script>

<template>
  <img v-if="style && url" :src="url" alt="" draggable="false" :style="style" />
</template>
