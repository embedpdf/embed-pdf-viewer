<script lang="ts">
  import type { Rect } from '@embedpdf/models';
  import type { FreeTextPreviewData } from '@embedpdf/plugin-annotation';
  import { patching } from '@embedpdf/plugin-annotation';

  interface CalloutFreeTextPreviewProps {
    data: FreeTextPreviewData;
    bounds: Rect;
    scale: number;
  }

  let { data, bounds, scale }: CalloutFreeTextPreviewProps = $props();

  const cl = $derived(data.calloutLine);
  const sw = $derived(data.strokeWidth ?? 1);
  const sc = $derived(data.strokeColor ?? '#000000');
  const op = $derived(data.opacity ?? 1);
  const w = $derived(bounds.size.width);
  const h = $derived(bounds.size.height);
  const ox = $derived(bounds.origin.x);
  const oy = $derived(bounds.origin.y);

  const lineCoords = $derived.by(() => {
    if (!cl || cl.length < 2) return null;
    return cl.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  });

  const ending = $derived.by(() => {
    if (!lineCoords || lineCoords.length < 2) return null;
    const angle = Math.atan2(lineCoords[1].y - lineCoords[0].y, lineCoords[1].x - lineCoords[0].x);
    return patching.createEnding(
      data.lineEnding,
      sw,
      angle + Math.PI,
      lineCoords[0].x,
      lineCoords[0].y,
    );
  });

  const halfSw = $derived(sw / 2);
  const tb = $derived(data.textBox);
</script>

{#if lineCoords}
  <svg
    style="position: absolute; pointer-events: none; overflow: visible;"
    style:width={`${w * scale}px`}
    style:height={`${h * scale}px`}
    width={w * scale}
    height={h * scale}
    viewBox={`0 0 ${w} ${h}`}
  >
    <polyline
      points={lineCoords.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke={sc}
      stroke-width={sw}
      opacity={op}
    />
    {#if ending}
      <path
        d={ending.d}
        transform={ending.transform}
        stroke={sc}
        fill={ending.filled ? (data.color ?? 'transparent') : 'none'}
        stroke-width={sw}
        opacity={op}
      />
    {/if}
    {#if tb}
      <rect
        x={tb.origin.x - ox + halfSw}
        y={tb.origin.y - oy + halfSw}
        width={tb.size.width - sw}
        height={tb.size.height - sw}
        fill={data.color ?? data.backgroundColor ?? 'transparent'}
        stroke={sc}
        stroke-width={sw}
        opacity={op}
      />
    {/if}
  </svg>
{/if}
