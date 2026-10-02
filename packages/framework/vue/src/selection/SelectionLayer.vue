<!--
  <SelectionLayer>: the highlight of the selected text on one page. It warms
  the page's text geometry when it mounts, reads the selected lines in page
  space and maps each one's four corners to the page's pixels, in the plugin's
  `color` setting, which the `--epdf-text-selection` CSS variable overrides.
  It handles no pointer input: <PagePointerSource> and the interaction hub do.
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { shallowEqual } from '@embedpdf/core';
// The layer is a host of the plugin (geometry warming, the highlight
// handshake); app code gets the public lens through `useSelection()`.
import { SelectionToken as SelectionHostToken } from '@embedpdf/plugin-selection/contract/host';
import type { SelectionSegment } from '@embedpdf/plugin-selection';
import { mixAccent, paint, quadInPixels, svgPoints } from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { useViewerSettings } from '../runtime/documents';
import { usePage } from '../runtime/page';
import { useSelectionSettings } from './composables';

const NO_SEGMENTS: readonly SelectionSegment[] = Object.freeze([]);

const page = usePage();
const selection = useOptionalCapability(SelectionHostToken);
// The same list until a line on this page changes.
const segments = useOptionalSelector(
  SelectionHostToken,
  (lens) => lens.listSegments(page.value.ref),
  NO_SEGMENTS,
  shallowEqual,
);
// Something drawing its own preview of the selection (a markup tool) can take
// the visual over; then this layer draws nothing, so the two never overlap.
const visible = useOptionalSelector(SelectionHostToken, (lens) => lens.isHighlightVisible(), false);
const color = useSelectionSettings((settings) => settings.color);
// An unset color follows the viewer's accent, behind the `--epdf-accent` variable.
const accent = useViewerSettings((settings) => settings.accent);

// Warm this page's text geometry as soon as it's on screen, so the first press
// can hit-test without waiting for the engine. Without permission to select
// text nothing loads, and nothing is drawn.
watch(
  [selection, () => page.value.ref],
  ([lens, pageRef]) => {
    if (lens) void lens.ensureLoaded(pageRef);
  },
  { immediate: true },
);

// Unset, the color is the accent at 35%, the accent's CSS variables included.
const fill = computed(() =>
  paint('text-selection', color.value ?? mixAccent('text-selection', accent.value)),
);

// Page space to the page layer's pixels, which turn with the page: mapping the
// four corners is exact, for turned text too.
const polygons = computed(() =>
  segments.value.map((segment) => svgPoints(quadInPixels(segment.quad, page.value.transform))),
);
</script>

<template>
  <svg
    v-if="visible"
    :style="{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
    }"
  >
    <!-- The fill goes in `style`: an SVG attribute doesn't read var(). -->
    <polygon v-for="(points, index) in polygons" :key="index" :points="points" :style="{ fill }" />
  </svg>
</template>
