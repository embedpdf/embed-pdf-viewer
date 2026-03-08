<script lang="ts">
  import { getContrastStrokeColor } from '@embedpdf/models';

  interface TextProps {
    isSelected: boolean;
    color?: string;
    opacity?: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }

  let {
    isSelected,
    color = '#facc15',
    opacity = 1,
    onClick,
    appearanceActive = false,
  }: TextProps = $props();

  const lineColor = $derived(getContrastStrokeColor(color));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  style:position="absolute"
  style:inset="0"
  style:z-index="2"
  style:pointer-events={isSelected ? 'none' : 'auto'}
  style:cursor={isSelected ? 'move' : 'pointer'}
  onpointerdown={onClick}
>
  {#if !appearanceActive}
    <svg
      style:position="absolute"
      style:inset="0"
      style:pointer-events="none"
      viewBox="0 0 20 20"
      width="100%"
      height="100%"
    >
      <path
        d="M 0.5 15.5 L 0.5 0.5 L 19.5 0.5 L 19.5 15.5 L 8.5 15.5 L 6.5 19.5 L 4.5 15.5 Z"
        fill={color}
        {opacity}
        stroke={lineColor}
        stroke-width="1"
        stroke-linejoin="miter"
      />
      <line x1="2.5" y1="4.25" x2="17.5" y2="4.25" stroke={lineColor} stroke-width="1" />
      <line x1="2.5" y1="8" x2="17.5" y2="8" stroke={lineColor} stroke-width="1" />
      <line x1="2.5" y1="11.75" x2="17.5" y2="11.75" stroke={lineColor} stroke-width="1" />
    </svg>
  {/if}
</div>
