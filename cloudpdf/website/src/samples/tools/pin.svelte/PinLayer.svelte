<script lang="ts" module>
  import type { PageRef } from '@embedpdf/svelte/runtime';

  export interface Pin {
    readonly id: number;
    readonly page: PageRef;
    readonly point: { readonly x: number; readonly y: number };
  }
</script>

<!-- The pins on one page, placed in its pixels at the last moment. -->
<script lang="ts">
  import { pageRefsEqual, type PageContextValue } from '@embedpdf/svelte/runtime';

  let { page, pins }: { page: PageContextValue; pins: readonly Pin[] } = $props();
</script>

{#each pins.filter((pin) => pageRefsEqual(pin.page, page.ref)) as pin (pin.id)}
  {@const { x, y } = page.transform.toPixels(pin.point)}
  <span class="pin" style:left="{x}px" style:top="{y}px">{pin.id}</span>
{/each}
