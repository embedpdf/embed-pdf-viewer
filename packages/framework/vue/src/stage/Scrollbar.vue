<!--
  <Scrollbar>: a headless scrollbar for a Stage lens, a view of the lens's
  scroll metrics (the native scroller contract: scrollTop, scrollHeight,
  clientHeight, in screen px). Thumb drag with pointer capture and a kept grab
  point, track paging with press-and-hold repeat that stops at the pointer, a
  minimum thumb length on long documents, and overlay auto-hide. On an unbounded
  stage the range is the union of content and view, so the bar shrinks as you
  pan away; the mapping is frozen during a thumb drag so the thumb never chases
  itself.

  Geometry and behavior live here; looks live in your CSS, against
    [data-embedpdf-scrollbar][data-axis="y"][data-state="visible|hidden"]
    [data-embedpdf-scrollbar][data-dragging]
    [data-embedpdf-scrollbar-thumb]
  `class` and `style` go on the track, `thumb-class` and `thumb-style` on the
  thumb. Unstyled, it is a transparent track pinned to the view's edge with a
  `var(--epdf-scrollbar-thumb, …)` pill.
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { CSSProperties, StyleValue } from 'vue';
import { createScrollbarPresses, paintDefault, scrollbarLayout } from '@embedpdf/web';
import type { ScrollbarTrack } from '@embedpdf/web';
import { useCapabilityRef } from '../runtime/capabilities';
import { asHost, useScrollMetricsValue } from './composables';
import { useStageToken } from './scope';
import type { StageTokenProp } from './scope';

const props = withDefaults(
  defineProps<{
    axis: 'x' | 'y';
    /** The stage lens to scroll: the nearest `<StageScope>` / `<Stage>`'s, else the main StageToken. */
    token?: StageTokenProp;
    /**
     * Overlay auto-hide: fade this many ms after the view stops moving (drags
     * and hover keep it visible; a hidden bar ignores the pointer, like macOS).
     * `false` keeps it visible. Published as `data-state="visible|hidden"`.
     */
    autoHide?: number | false;
    /** Minimum thumb length in px, so the bar never vanishes on long documents. */
    minThumbSize?: number;
    /**
     * Pressing the track: 'page' steps by 90% of a view toward the pointer,
     * repeats while held, and stops when the thumb reaches the pointer; 'jump'
     * centres the thumb at the pointer and hands off to a drag.
     */
    trackPress?: 'page' | 'jump';
    /** The thumb's class. */
    thumbClass?: string;
    /** The thumb's style, over its defaults. */
    thumbStyle?: StyleValue;
  }>(),
  { autoHide: 1200, minThumbSize: 24, trackPress: 'page' },
);

const token = useStageToken(() => props.token);
const stage = useCapabilityRef(computed(() => asHost(token.value)));
const metrics = useScrollMetricsValue(token);
const vertical = computed(() => props.axis === 'y');
const scrollable = computed(() =>
  vertical.value ? metrics.value.scrollableY : metrics.value.scrollableX,
);

const track = ref<HTMLDivElement | null>(null);
const trackPx = ref(0);
const dragging = ref(false);
const hovered = ref(false);
// The view moved recently.
const active = ref(true);

// The thumb along the track: one formula for drawing, dragging and paging, shared with every framework.
const layout = computed(() =>
  scrollbarLayout(metrics.value, vertical.value, trackPx.value, props.minThumbSize),
);

// ── overlay auto-hide: any metrics change re-arms the fade ─────────────────
const hideAfter = computed(() => (props.autoHide === false ? 0 : props.autoHide));
watch(
  [metrics, hideAfter],
  ([, delay], _previous, onCleanup) => {
    if (!delay) return;
    active.value = true;
    const timer = setTimeout(() => (active.value = false), delay);
    onCleanup(() => clearTimeout(timer));
  },
  { immediate: true },
);
const shown = computed(() => !hideAfter.value || active.value || hovered.value || dragging.value);

// ── track measurement: the px mapping needs real geometry ─────────────────
watch(
  [track, vertical],
  ([element, isVertical], _previous, onCleanup) => {
    if (!element) return;
    const measure = () => {
      trackPx.value = isVertical ? element.clientHeight : element.clientWidth;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    onCleanup(() => observer.disconnect());
  },
  { immediate: true, flush: 'post' },
);

// ── interactions: `@embedpdf/web`'s press handling (thumb drags, track paging
//    and jumps), handed the bar as it is now on every event. ──────────────────
const presses = createScrollbarPresses((value) => (dragging.value = value));
const pressedTrack = (): ScrollbarTrack => ({
  stage: stage.value,
  vertical: vertical.value,
  element: track.value!,
  layout: layout.value,
  // Fresh geometry for paging steps: read from the capability, never a stale render.
  liveLayout: () =>
    scrollbarLayout(
      stage.value.getScrollMetrics(),
      vertical.value,
      trackPx.value,
      props.minThumbSize,
    ),
});

// No repeat timer outlives the bar.
onUnmounted(() => presses.release());

const trackStyle = computed(
  (): CSSProperties => ({
    ...(vertical.value
      ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: '12px' }
      : { position: 'absolute', left: 0, right: 0, bottom: 0, height: '12px' }),
    touchAction: 'none',
    userSelect: 'none',
    opacity: shown.value ? 1 : 0,
    transition: 'opacity 200ms',
    // A hidden overlay bar must not eat the clicks under it.
    pointerEvents: shown.value ? 'auto' : 'none',
  }),
);
const thumbDefaults = computed((): CSSProperties => {
  const { thumbPosition, thumbLength } = layout.value;
  return {
    ...(vertical.value
      ? {
          position: 'absolute',
          left: '2px',
          right: '2px',
          top: `${thumbPosition}px`,
          height: `${thumbLength}px`,
        }
      : {
          position: 'absolute',
          top: '2px',
          bottom: '2px',
          left: `${thumbPosition}px`,
          width: `${thumbLength}px`,
        }),
    borderRadius: '6px',
    background: paintDefault('scrollbar-thumb'),
  };
});
</script>

<template>
  <div
    v-if="scrollable"
    ref="track"
    role="scrollbar"
    :aria-orientation="vertical ? 'vertical' : 'horizontal'"
    :aria-valuemin="0"
    :aria-valuemax="Math.round(layout.maxOffset)"
    :aria-valuenow="Math.round(layout.offset)"
    data-embedpdf-scrollbar=""
    :data-axis="axis"
    :data-state="shown ? 'visible' : 'hidden'"
    :data-dragging="dragging ? '' : undefined"
    :style="trackStyle"
    @pointerdown="presses.pressTrack($event, pressedTrack(), trackPress)"
    @pointermove="presses.move($event, pressedTrack())"
    @pointerup="presses.release()"
    @pointercancel="presses.release()"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
  >
    <div
      data-embedpdf-scrollbar-thumb=""
      :class="thumbClass"
      :style="[thumbDefaults, thumbStyle]"
      @pointerdown="presses.pressThumb($event, pressedTrack())"
    />
  </div>
</template>
