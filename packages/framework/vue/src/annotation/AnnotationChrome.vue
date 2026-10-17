<!--
  The selection's chrome on one page: its outline, handles, rotation handle,
  snapping guides, the lines of a turn in progress and the box dragged to
  select. The plugin lists the nodes and sizes the screen-constant parts for
  the page's zoom; `@embedpdf/web` puts them in pixels and paints them through
  their `--epdf-annotation-*` variables. The layer draws them as SVG; a
  `#handle` or `#rotation-handle` slot draws its handles as HTML over the page
  instead. The viewer still decides where a handle can be grabbed, so what a
  slot draws can't break dragging.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import { shallowEqual } from '@embedpdf/core';
import type { ChromeNode } from '@embedpdf/core-annotation';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { annotationChromePaint, chromeInPixels } from '@embedpdf/web';
import { useOptionalSelector } from '../runtime/capabilities';
import { useViewerSettings } from '../runtime/documents';
import type { PageContextValue } from '../runtime/page';
import { useAnnotationSettings } from './state';
import type { HandleProps, RotationHandleProps } from './types';

const props = defineProps<{ page: PageContextValue }>();

const slots = defineSlots<{
  /** One handle, drawn your way. */
  handle?(props: HandleProps): unknown;
  /** The rotation handle, drawn your way. */
  'rotation-handle'?(props: RotationHandleProps): unknown;
}>();

const NO_NODES: readonly ChromeNode[] = Object.freeze([]);

// The page's view scale converts the screen-pixel chrome settings into
// content units inside the plugin (the rotation handle's offset, grab zones):
// screen-constant at every zoom. What this draws is in screen pixels already.
const nodes = useOptionalSelector(
  AnnotationHostToken,
  (host) => {
    const { transform, ref } = props.page;
    return host.listChromeNodes(ref, transform.viewScale, transform.rotation, transform.zoom);
  },
  NO_NODES,
  shallowEqual,
);
const chrome = useAnnotationSettings((settings) => settings.chrome);
const accent = useViewerSettings((settings) => settings.accent);
/**
 * The chrome settings, painted, as each part's `style`: follows the settings
 * and the viewer's accent live. Paint goes in `style`, never in SVG
 * attributes, which don't read the `var(--epdf-…)` the paint starts with.
 */
const painted = computed(() => {
  const paint = annotationChromePaint(chrome.value, accent.value);
  const style = (part: object): CSSProperties => ({ ...part });
  return {
    outline: style(paint.outline),
    handle: style(paint.handle),
    rotationHandle: style(paint.rotationHandle),
    rotationStalk: style({ stroke: paint.rotationHandle.stroke }),
    guide: style(paint.guide),
    rotationGuide: style(paint.rotationGuide),
    marquee: style(paint.marquee),
  };
});
const pixels = computed(() => chromeInPixels(nodes.value, props.page.transform));

/** Whether there are handles a slot could draw: the slots' own element exists only then. */
const hasHandles = computed(() =>
  pixels.value.some((node) => node.kind === 'handle' || node.kind === 'rotation-handle'),
);
</script>

<template>
  <svg :style="{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }">
    <template v-for="(node, index) in pixels" :key="index">
      <template v-if="node.kind === 'handle'">
        <template v-if="!slots.handle">
          <circle
            v-if="chrome.handles.shape === 'circle'"
            :cx="node.at.x"
            :cy="node.at.y"
            :r="chrome.handles.size / 2"
            stroke-width="1.5"
            :style="painted.handle"
          />
          <!-- The square rides a turned box's orientation (it spins about itself). -->
          <rect
            v-else
            :x="node.at.x - chrome.handles.size / 2"
            :y="node.at.y - chrome.handles.size / 2"
            :width="chrome.handles.size"
            :height="chrome.handles.size"
            stroke-width="1.5"
            :style="painted.handle"
            :transform="node.rotation ? `rotate(${node.rotation} ${node.at.x} ${node.at.y})` : undefined"
          />
        </template>
      </template>
      <line
        v-else-if="node.kind === 'guide'"
        :x1="node.from.x"
        :y1="node.from.y"
        :x2="node.to.x"
        :y2="node.to.y"
        shape-rendering="crispEdges"
        :style="painted.guide"
      />
      <polygon
        v-else-if="node.kind === 'turned-outline'"
        :points="node.points"
        fill="none"
        :style="painted.outline"
      />
      <g v-else-if="node.kind === 'rotation-guides'">
        <line
          v-for="(line, lineIndex) in node.lines"
          :key="lineIndex"
          :x1="line.from.x"
          :y1="line.from.y"
          :x2="line.to.x"
          :y2="line.to.y"
          :opacity="line.opacity"
          :style="painted.rotationGuide"
        />
      </g>
      <template v-else-if="node.kind === 'rotation-handle'">
        <g v-if="!slots['rotation-handle']">
          <line
            v-if="chrome.rotationHandle.stalk"
            :x1="node.from.x"
            :y1="node.from.y"
            :x2="node.at.x"
            :y2="node.at.y"
            stroke-width="1"
            :style="painted.rotationStalk"
          />
          <circle
            :cx="node.at.x"
            :cy="node.at.y"
            :r="chrome.rotationHandle.size / 2"
            stroke-width="1.5"
            :style="painted.rotationHandle"
          />
        </g>
      </template>
      <!-- The box dragged to select keeps its own look (a see-through accent
           fill, always dashed); the selection outline follows the settings. -->
      <rect
        v-else-if="node.kind === 'marquee'"
        :x="node.box.left"
        :y="node.box.top"
        :width="node.box.width"
        :height="node.box.height"
        stroke-width="1"
        stroke-dasharray="4 3"
        :style="painted.marquee"
      />
      <rect
        v-else-if="node.kind === 'outline'"
        :x="node.box.left"
        :y="node.box.top"
        :width="node.box.width"
        :height="node.box.height"
        fill="none"
        :style="painted.outline"
      />
    </template>
  </svg>
  <div
    v-if="hasHandles && (slots.handle || slots['rotation-handle'])"
    :style="{ position: 'absolute', inset: 0, pointerEvents: 'none' }"
  >
    <template v-for="(node, index) in pixels" :key="index">
      <slot
        v-if="node.kind === 'handle' && slots.handle"
        name="handle"
        :at="node.at"
        :size="chrome.handles.size"
        :rotation="node.rotation"
        :kind="node.role"
        :active="node.active"
      />
      <slot
        v-else-if="node.kind === 'rotation-handle' && slots['rotation-handle']"
        name="rotation-handle"
        :at="node.at"
        :from="node.from"
        :size="chrome.rotationHandle.size"
        :rotation="0"
        :active="false"
      />
    </template>
  </div>
</template>
