<script lang="ts" module>
  import type { PageRef } from '@embedpdf/svelte/runtime';

  export interface Dot {
    readonly id: number;
    readonly page: PageRef;
    readonly point: { readonly x: number; readonly y: number };
    readonly color: string;
  }
</script>

<script lang="ts">
  import { pageRefsEqual, type PageContextValue } from '@embedpdf/svelte/runtime';

  let { page, dots }: { page: PageContextValue; dots: readonly Dot[] } = $props();
</script>

{#each dots.filter((dot) => pageRefsEqual(dot.page, page.ref)) as dot (dot.id)}
  {@const { x, y } = page.transform.toPixels(dot.point)}
  <span class="dot" style:left="{x}px" style:top="{y}px" style:background={dot.color}></span>
{/each}
