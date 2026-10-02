<!--
  A scrollbar for a Stage lens that you style yourself: a view of `stage.getScrollMetrics()`.

  Thumb drag with pointer capture and a kept grab point, track paging with press-and-hold repeat
  that stops at the pointer, a minimum thumb length on long documents, and macOS-style auto-hide.
  On an unbounded stage the metrics already carry the union of content and view, so the bar
  shrinks as you pan away; the mapping is frozen during a thumb drag, so the thumb never chases
  itself while that union changes.

  Geometry and behavior live here, looks in your CSS, against
    [data-embedpdf-scrollbar][data-axis="y"][data-state="visible|hidden"]
    [data-embedpdf-scrollbar][data-dragging]
    [data-embedpdf-scrollbar-thumb]
  Unstyled, it's a transparent track at the viewport's edge with a `--epdf-scrollbar-thumb` pill.
  Build anything else (a minimap, a progress ring) from `useScrollMetrics()` and `stage.scrollTo()`.
-->
<script lang="ts">
  import {
    createScrollbarPresses,
    paintDefault,
    scrollbarLayout,
    type ScrollbarTrack,
  } from '@embedpdf/web';
  import { useCapability } from '../runtime/readers.svelte';
  import type { ScrollbarProps } from './props';
  import { asHost, scrollMetricsOf } from './readers.svelte';
  import { stageTokenOf } from './stage-scope';

  let {
    axis,
    token: explicitToken,
    autoHide = 1200,
    minThumbSize = 24,
    trackPress = 'page',
    class: className,
    style,
    thumbClass,
    thumbStyle,
  }: ScrollbarProps = $props();

  const lens = stageTokenOf(() => explicitToken);
  const stage = useCapability(() => asHost(lens()));
  const metrics = scrollMetricsOf(lens);

  const vertical = $derived(axis === 'y');
  const scrollable = $derived(vertical ? metrics.scrollableY : metrics.scrollableX);

  let track: HTMLDivElement | undefined = $state();
  let trackPx = $state(0);
  let dragging = $state(false);
  let hovered = $state(false);
  let active = $state(true); // the view moved recently

  // The thumb along the track: one formula for drawing, dragging and paging, shared with every
  // framework.
  const layout = $derived(scrollbarLayout(metrics, vertical, trackPx, minThumbSize));

  // ── auto-hide: any metrics change shows the bar and starts the fade again ──
  const hideAfter = $derived(autoHide === false ? 0 : autoHide);
  $effect(() => {
    // Every number, so any movement counts.
    void [metrics.scrollTop, metrics.scrollLeft, metrics.scrollHeight, metrics.scrollWidth];
    void [metrics.clientHeight, metrics.clientWidth];
    if (!hideAfter) return;
    active = true;
    const timer = setTimeout(() => (active = false), hideAfter);
    return () => clearTimeout(timer);
  });
  const shown = $derived(!hideAfter || active || hovered || dragging);

  // ── the track's length, which the pixel mapping needs ──
  $effect(() => {
    const element = track;
    const isVertical = vertical;
    if (!element) return;
    const measure = () => (trackPx = isVertical ? element.clientHeight : element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  });

  // ── input: `@embedpdf/web`'s press handling (thumb drags, track paging and jumps), handed the
  //    bar as it is now on every event. ──
  const presses = createScrollbarPresses((value) => (dragging = value));
  const pressedTrack = (): ScrollbarTrack => ({
    stage,
    vertical,
    element: track!,
    layout,
    // Fresh geometry for paging steps, from the capability rather than the last drawn frame.
    liveLayout: () => scrollbarLayout(stage.getScrollMetrics(), vertical, trackPx, minThumbSize),
  });

  // No repeat timer outlives the bar.
  $effect(() => () => presses.release());

  const trackDefaults = $derived(
    vertical
      ? 'position: absolute; top: 0; right: 0; bottom: 0; width: 12px;'
      : 'position: absolute; left: 0; right: 0; bottom: 0; height: 12px;',
  );
  const thumbDefaults = $derived(
    vertical
      ? `position: absolute; left: 2px; right: 2px; top: ${layout.thumbPosition}px; height: ${layout.thumbLength}px;`
      : `position: absolute; top: 2px; bottom: 2px; left: ${layout.thumbPosition}px; width: ${layout.thumbLength}px;`,
  );
</script>

{#if scrollable}
  <!-- The bar drives the Stage, which is no single element to name in aria-controls, and the
       pointer is its input: like a native overlay scrollbar, it takes no focus. -->
  <!-- svelte-ignore a11y_role_has_required_aria_props, a11y_interactive_supports_focus -->
  <div
    bind:this={track}
    role="scrollbar"
    aria-orientation={vertical ? 'vertical' : 'horizontal'}
    aria-valuemin={0}
    aria-valuemax={Math.round(layout.maxOffset)}
    aria-valuenow={Math.round(layout.offset)}
    data-embedpdf-scrollbar=""
    data-axis={axis}
    data-state={shown ? 'visible' : 'hidden'}
    data-dragging={dragging ? '' : undefined}
    class={className}
    style="{trackDefaults} touch-action: none; user-select: none; opacity: {shown
      ? 1
      : 0}; transition: opacity 200ms; pointer-events: {shown ? 'auto' : 'none'};{style
      ? ` ${style}`
      : ''}"
    onpointerdown={(event) => presses.pressTrack(event, pressedTrack(), trackPress)}
    onpointermove={(event) => presses.move(event, pressedTrack())}
    onpointerup={() => presses.release()}
    onpointercancel={() => presses.release()}
    onpointerenter={() => (hovered = true)}
    onpointerleave={() => (hovered = false)}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      data-embedpdf-scrollbar-thumb=""
      class={thumbClass}
      style="{thumbDefaults} border-radius: 6px; background: {paintDefault(
        'scrollbar-thumb',
      )};{thumbStyle ? ` ${thumbStyle}` : ''}"
      onpointerdown={(event) => presses.pressThumb(event, pressedTrack())}
    ></div>
  </div>
{/if}
