<!--
  <SearchLayer>: the matches on one page, painted from the plugin's page-space
  hits through the page's transform, in the plugin's `highlight` colors, which
  the `--epdf-search-*` CSS variables override. It never calls the engine:
  search is driven from your chrome with `useSearch()`. With `@hit-click`, a
  click on a match tells you which one.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { SearchHit } from '@embedpdf/plugin-search';
import { createClickDetector, paint, searchHighlightsOf } from '@embedpdf/web';
import { usePage } from '../runtime/page';
import { useSearchHits, useSearchSettings, useSearchState } from './composables';

const props = defineProps<{
  /**
   * `@hit-click`: makes the matches clickable, and is called with the match
   * someone clicks, for example to make it the active one with
   * `search.goToHit(hit)`. The press still reaches the page, so a drag that
   * starts on a match selects text, and only a click calls it. Without it,
   * matches are only paint and the pointer goes straight through.
   *
   * A prop rather than an emitted event, so the layer knows whether you
   * listen: only then do the matches take the pointer.
   */
  onHitClick?: (hit: SearchHit) => void;
}>();

const page = usePage();
// The plugin hands out the same array per page until matches land on it, so
// this changes only then.
const hits = useSearchHits(() => page.value.ref);
const active = useSearchState((state) => state.activeHit);
const highlight = useSearchSettings((settings) => settings.highlight);
// Tells a click on a match from a drag that starts there (and selects text).
const clicks = createClickDetector();

/** One painted piece per segment of each match: a rounded box when upright, its true quad when turned. */
const pieces = computed(() =>
  searchHighlightsOf(hits.value, {
    active: active.value,
    page: page.value.transform,
    // Each color is its CSS variable first, then the setting: CSS wins.
    color: paint('search-highlight', highlight.value.color),
    activeColor: paint('search-highlight-active', highlight.value.activeColor),
  }),
);

const blendMode = computed(
  () => paint('search-blend-mode', highlight.value.blendMode) as CSSProperties['mixBlendMode'],
);

// Only a clickable match takes the pointer; a plain highlight stays inert.
const clickable = computed(
  (): CSSProperties => (props.onHitClick ? { pointerEvents: 'auto', cursor: 'pointer' } : {}),
);

// Nothing here stops the press, so it reaches the page as well.
function onPress(event: PointerEvent): void {
  if (props.onHitClick) clicks.press(event);
}
function onClick(hit: SearchHit, event: MouseEvent): void {
  if (props.onHitClick && clicks.isClick(event)) props.onHitClick(hit);
}
</script>

<template>
  <div v-if="hits.length > 0" :style="{ position: 'absolute', inset: 0, pointerEvents: 'none' }">
    <template v-for="piece in pieces" :key="piece.key">
      <div
        v-if="piece.box"
        :style="{
          position: 'absolute',
          left: `${piece.box.left}px`,
          top: `${piece.box.top}px`,
          width: `${piece.box.width}px`,
          height: `${piece.box.height}px`,
          backgroundColor: piece.fill,
          mixBlendMode: blendMode,
          borderRadius: '2px',
          ...clickable,
        }"
        @pointerdown="onPress"
        @click="onClick(piece.hit, $event)"
      />
      <svg
        v-else
        :style="{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          mixBlendMode: blendMode,
        }"
      >
        <!-- The fill goes in `style`: an SVG attribute doesn't read var(). -->
        <polygon
          :points="piece.points ?? ''"
          :style="{ fill: piece.fill, ...clickable }"
          @pointerdown="onPress"
          @click="onClick(piece.hit, $event)"
        />
      </svg>
    </template>
  </div>
</template>
