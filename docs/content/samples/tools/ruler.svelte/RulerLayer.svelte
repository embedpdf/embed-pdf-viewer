<script lang="ts" module>
  import type { PageRef } from '@embedpdf/svelte/runtime';

  export interface Point {
    readonly x: number;
    readonly y: number;
  }

  export interface Measurement {
    readonly page: PageRef;
    readonly from: Point;
    readonly to: Point;
  }

  // Page coordinates are points, 72 to the inch.
  export const lengthOf = ({ from, to }: Measurement) => {
    const inches = Math.hypot(to.x - from.x, to.y - from.y) / 72;
    return `${inches.toFixed(2)} in · ${(inches * 2.54).toFixed(1)} cm`;
  };
</script>

<!-- The measured line on its page, placed in the page's pixels. -->
<script lang="ts">
  import { pageRefsEqual, type PageContextValue } from '@embedpdf/svelte/runtime';

  let { page, measurement }: { page: PageContextValue; measurement: Measurement | null } = $props();
</script>

{#if measurement && pageRefsEqual(measurement.page, page.ref)}
  {@const from = page.transform.toPixels(measurement.from)}
  {@const to = page.transform.toPixels(measurement.to)}
  <svg class="ruler-layer">
    <line class="ruler-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
    <circle class="ruler-end" cx={from.x} cy={from.y} r={4} />
    <circle class="ruler-end" cx={to.x} cy={to.y} r={4} />
  </svg>
  <span
    class="ruler-label"
    style:left="{(from.x + to.x) / 2}px"
    style:top="{(from.y + to.y) / 2}px"
  >
    {lengthOf(measurement)}
  </span>
{/if}
