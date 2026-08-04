<script lang="ts">
  import type { Position } from '@embedpdf/models';

  const LABEL_FONT_PX = 12;
  const PADDING_X_PX = 5;
  const PADDING_Y_PX = 3;
  const CHAR_WIDTH_RATIO = 0.6;

  interface Props {
    text: string;
    center: Position;
    scale: number;
    color?: string;
    background?: string;
  }

  let { text, center, scale, color = '#ffffff', background = '#2962FF' }: Props = $props();

  // Guard against a zero/invalid zoom factor producing Infinity dimensions.
  const safeScale = $derived(scale > 0 && Number.isFinite(scale) ? scale : 1);
  const fontSize = $derived(LABEL_FONT_PX / safeScale);
  const padX = $derived(PADDING_X_PX / safeScale);
  const padY = $derived(PADDING_Y_PX / safeScale);
  const boxW = $derived(text.length * fontSize * CHAR_WIDTH_RATIO + padX * 2);
  const boxH = $derived(fontSize + padY * 2);
</script>

<g style:pointer-events="none">
  <rect
    x={center.x - boxW / 2}
    y={center.y - boxH / 2}
    width={boxW}
    height={boxH}
    rx={padY}
    ry={padY}
    fill={background}
    opacity={0.92}
  />
  <text
    x={center.x}
    y={center.y}
    fill={color}
    font-size={fontSize}
    text-anchor="middle"
    dominant-baseline="central"
    style:font-family="system-ui, -apple-system, sans-serif"
    style:font-weight="600"
    style:user-select="none">{text}</text
  >
</g>
