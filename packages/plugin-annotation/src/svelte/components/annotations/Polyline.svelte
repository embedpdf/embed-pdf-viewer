<script lang="ts">
  import type { Rect, Position, LineEndings } from '@embedpdf/models';
  import { patching } from '@embedpdf/plugin-annotation';

  const MIN_HIT_AREA_SCREEN_PX = 20;

  interface PolylineProps {
    rect: Rect;
    vertices: Position[];
    color?: string;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    scale: number;
    isSelected: boolean;
    onClick?: (e: MouseEvent | TouchEvent) => void;
    lineEndings?: LineEndings;
    appearanceActive?: boolean;
  }

  let {
    rect,
    vertices,
    color = 'transparent',
    strokeColor = '#000000',
    opacity = 1,
    strokeWidth,
    scale,
    isSelected,
    onClick,
    lineEndings,
    appearanceActive = false,
  }: PolylineProps = $props();

  const localPts = $derived(
    vertices.map(({ x, y }) => ({ x: x - rect.origin.x, y: y - rect.origin.y })),
  );

  const pathData = $derived.by(() => {
    if (!localPts.length) return '';
    const [first, ...rest] = localPts;
    return (
      `M ${first.x} ${first.y} ` +
      rest
        .map((p) => `L ${p.x} ${p.y} `)
        .join('')
        .trim()
    );
  });

  const endings = $derived.by(() => {
    if (localPts.length < 2) return { start: null as any, end: null as any };
    const toAngle = (a: Position, b: Position) => Math.atan2(b.y - a.y, b.x - a.x);

    const startRad = toAngle(localPts[0], localPts[1]);
    const endRad = toAngle(localPts[localPts.length - 2], localPts[localPts.length - 1]);

    const start = patching.createEnding(
      lineEndings?.start,
      strokeWidth,
      startRad + Math.PI,
      localPts[0].x,
      localPts[0].y,
    );
    const end = patching.createEnding(
      lineEndings?.end,
      strokeWidth,
      endRad,
      localPts[localPts.length - 1].x,
      localPts[localPts.length - 1].y,
    );
    return { start, end };
  });

  const width = $derived(rect.size.width * scale);
  const height = $derived(rect.size.height * scale);
  const hitStrokeWidth = $derived(Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale));
</script>

<svg
  style="position: absolute; width: var(--w); height: var(--h); pointer-events: none; z-index: 2; overflow: visible;"
  style:--w={`${width}px`}
  style:--h={`${height}px`}
  {width}
  {height}
  viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
>
  <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <path
    d={pathData}
    fill="none"
    stroke="transparent"
    stroke-width={hitStrokeWidth}
    onpointerdown={onClick}
    ontouchstart={onClick}
    style:cursor={isSelected ? 'move' : 'pointer'}
    style:pointer-events={isSelected ? 'none' : 'visibleStroke'}
    style:stroke-linecap="butt"
    style:stroke-linejoin="miter"
  />
  {#if endings.start}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <path
      d={endings.start.d}
      transform={endings.start.transform}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={onClick}
      ontouchstart={onClick}
      style:cursor={isSelected ? 'move' : 'pointer'}
      style:pointer-events={isSelected
        ? 'none'
        : endings.start.filled
          ? 'visible'
          : 'visibleStroke'}
      style:stroke-linecap="butt"
    />
  {/if}
  {#if endings.end}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <path
      d={endings.end.d}
      transform={endings.end.transform}
      fill="transparent"
      stroke="transparent"
      stroke-width={hitStrokeWidth}
      onpointerdown={onClick}
      ontouchstart={onClick}
      style:cursor={isSelected ? 'move' : 'pointer'}
      style:pointer-events={isSelected ? 'none' : endings.end.filled ? 'visible' : 'visibleStroke'}
      style:stroke-linecap="butt"
    />
  {/if}

  <!-- Visual -- hidden when AP active, never interactive -->
  {#if !appearanceActive}
    <path
      d={pathData}
      {opacity}
      style:fill="none"
      style:stroke={strokeColor ?? color}
      style:stroke-width={strokeWidth}
      style:pointer-events="none"
      style:stroke-linecap="butt"
      style:stroke-linejoin="miter"
    />
    {#if endings.start}
      <path
        d={endings.start.d}
        transform={endings.start.transform}
        stroke={strokeColor}
        fill={endings.start.filled ? color : 'none'}
        style:pointer-events="none"
        style:stroke-width={strokeWidth}
        style:stroke-linecap="butt"
      />
    {/if}
    {#if endings.end}
      <path
        d={endings.end.d}
        transform={endings.end.transform}
        stroke={strokeColor}
        fill={endings.end.filled ? color : 'none'}
        style:pointer-events="none"
        style:stroke-width={strokeWidth}
        style:stroke-linecap="butt"
      />
    {/if}
  {/if}
</svg>
