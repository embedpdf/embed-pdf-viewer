<script lang="ts">
  import type { Rect } from '@embedpdf/models';

  interface CaretProps {
    isSelected: boolean;
    strokeColor?: string;
    opacity?: number;
    rect: Rect;
    scale: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }

  let {
    isSelected,
    strokeColor = '#000000',
    opacity = 1,
    rect,
    scale,
    onClick,
    appearanceActive = false,
  }: CaretProps = $props();

  const { width, height, path } = $derived.by(() => {
    const w = rect.size.width;
    const h = rect.size.height;
    const midX = w / 2;

    const d = [
      `M 0 ${h}`,
      `C ${w * 0.27} ${h} ${midX} ${h - h * 0.44} ${midX} 0`,
      `C ${midX} ${h - h * 0.44} ${w - w * 0.27} ${h} ${w} ${h}`,
      'Z',
    ].join(' ');

    return { width: w, height: h, path: d };
  });

  let svgWidth = $derived(width * scale);
  let svgHeight = $derived(height * scale);
</script>

<svg
  style:position="absolute"
  style:width={`${svgWidth}px`}
  style:height={`${svgHeight}px`}
  style:pointer-events="none"
  style:z-index="2"
  width={svgWidth}
  height={svgHeight}
  viewBox={`0 0 ${width} ${height}`}
  overflow="visible"
>
  <!-- Hit area -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <path
    d={path}
    fill="transparent"
    stroke="transparent"
    stroke-width={4}
    onpointerdown={(e) => onClick?.(e)}
    style:cursor={isSelected ? 'move' : 'pointer'}
    pointer-events={isSelected ? 'none' : 'visible'}
  />
  <!-- Visual -->
  {#if !appearanceActive}
    <path
      d={path}
      fill={strokeColor}
      stroke={strokeColor}
      stroke-width={0.5}
      {opacity}
      fill-rule="evenodd"
      style:pointer-events="none"
    />
  {/if}
</svg>
