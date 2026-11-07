<!--
  <SnapshotLayer>: the `snapshot` tool's box on one page, while it's dragged
  and while it's held: the plugin's box in page space, in the page layer's
  pixels, in the plugin's `snapshot.box` colors, which the
  `--epdf-snapshot-box-*` CSS variables override. It only draws; the tool's
  handler takes the pointer. Put it in each page, after the other layers.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { RENDER_DEFAULTS, RenderToken } from '@embedpdf/plugin-render/contract/host';
import { rectInPixels, SNAPSHOT_BOX_DASH, snapshotBoxPaint } from '@embedpdf/web';
import { useOptionalSelector } from '../runtime/capabilities';
import { useViewerSettings } from '../runtime/documents';
import { usePage } from '../runtime/page';

const page = usePage();
const box = useOptionalSelector(
  RenderToken,
  (render) => render.getSnapshotBox(page.value.ref),
  null,
);
const colors = useOptionalSelector(
  RenderToken,
  (render) => render.getSettings().snapshot.box,
  RENDER_DEFAULTS.snapshot.box,
);
// Unset colors follow the viewer's accent, behind the `--epdf-accent` variable.
const accent = useViewerSettings((settings) => settings.accent);

const pixels = computed(() => box.value && rectInPixels(box.value, page.value.transform));
const boxStyle = computed(() => snapshotBoxPaint(colors.value, accent.value));
</script>

<template>
  <svg
    v-if="pixels"
    aria-hidden="true"
    :width="pixels.width"
    :height="pixels.height"
    :style="{
      position: 'absolute',
      left: `${pixels.left}px`,
      top: `${pixels.top}px`,
      overflow: 'visible',
      pointerEvents: 'none',
    }"
  >
    <!-- The colors go in `style`: an SVG attribute doesn't read var(). -->
    <rect
      :width="pixels.width"
      :height="pixels.height"
      stroke-width="1"
      :stroke-dasharray="SNAPSHOT_BOX_DASH"
      :style="boxStyle"
    />
  </svg>
</template>
