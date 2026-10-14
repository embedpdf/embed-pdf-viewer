<!--
  The selection's chrome on one page: its outline (turned with a turned selection), the resize
  and point handles, the rotation handle, a snapped move's guides, a turn's guides and the box
  dragged to select. The plugin lists the parts in page points; `@embedpdf/web` puts them in
  pixels and paints them, so their `--epdf-annotation-*` CSS variables win. The layer's handles
  are SVG; your `handle` and `rotationHandle` snippets draw as HTML over the page instead.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChromeNode } from '@embedpdf/core-annotation';
  // The chrome is a host read (the same runtime token, typed wider).
  import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
  import { chromeInPixels } from '@embedpdf/web';
  import type { PageContextValue } from '../runtime/page';
  import { shallowArray, useOptionalSelector } from '../runtime/readers.svelte';
  import { useChromePaint } from './chrome-paint.svelte';
  import type { HandleProps, RotationHandleProps } from './props';

  let {
    page,
    handle,
    rotationHandle,
  }: {
    page: PageContextValue;
    handle?: Snippet<[handle: HandleProps]>;
    rotationHandle?: Snippet<[handle: RotationHandleProps]>;
  } = $props();

  const NO_NODES: readonly ChromeNode[] = Object.freeze([]);

  // The page's view scale turns the screen-pixel chrome settings into page units inside the
  // plugin (the rotation handle's offset, the grab zones): constant on screen at every zoom.
  // What this draws is in screen pixels already.
  const nodes = useOptionalSelector(
    AnnotationHostToken,
    (annotation) =>
      annotation.listChromeNodes(
        page.ref,
        page.transform.viewScale,
        page.transform.rotation,
        page.transform.zoom,
      ),
    NO_NODES,
    shallowArray,
  );
  const paint = useChromePaint();
  const parts = $derived(chromeInPixels(nodes.current, page.transform));
  const yours = $derived(
    parts.filter(
      (part) =>
        (part.kind === 'handle' && handle) || (part.kind === 'rotation-handle' && rotationHandle),
    ),
  );
</script>

<svg style="position: absolute; inset: 0; overflow: visible; pointer-events: none">
  {#each parts as part, index (index)}
    {#if part.kind === 'handle' && !handle}
      {@const size = paint.chrome.handles.size}
      {#if paint.chrome.handles.shape === 'circle'}
        <circle
          cx={part.at.x}
          cy={part.at.y}
          r={size / 2}
          stroke-width="1.5"
          style={paint.css.handle}
        />
      {:else}
        <!-- The square rides a turned box's orientation (it spins about itself). -->
        <rect
          x={part.at.x - size / 2}
          y={part.at.y - size / 2}
          width={size}
          height={size}
          stroke-width="1.5"
          style={paint.css.handle}
          transform={part.rotation
            ? `rotate(${part.rotation} ${part.at.x} ${part.at.y})`
            : undefined}
        />
      {/if}
    {:else if part.kind === 'guide'}
      <line
        x1={part.from.x}
        y1={part.from.y}
        x2={part.to.x}
        y2={part.to.y}
        shape-rendering="crispEdges"
        style={paint.css.guide}
      />
    {:else if part.kind === 'turned-outline'}
      <polygon points={part.points} fill="none" style={paint.css.outline} />
    {:else if part.kind === 'rotation-guides'}
      <g>
        {#each part.lines as line, lineIndex (lineIndex)}
          <line
            x1={line.from.x}
            y1={line.from.y}
            x2={line.to.x}
            y2={line.to.y}
            opacity={line.opacity}
            style={paint.css.rotationGuide}
          />
        {/each}
      </g>
    {:else if part.kind === 'rotation-handle' && !rotationHandle}
      <g>
        {#if paint.chrome.rotationHandle.stalk}
          <line
            x1={part.from.x}
            y1={part.from.y}
            x2={part.at.x}
            y2={part.at.y}
            stroke-width="1"
            style={paint.css.rotationStalk}
          />
        {/if}
        <circle
          cx={part.at.x}
          cy={part.at.y}
          r={paint.chrome.rotationHandle.size / 2}
          stroke-width="1.5"
          style={paint.css.rotationHandle}
        />
      </g>
    {:else if part.kind === 'marquee'}
      <!-- The box dragged to select keeps its own look (a see-through accent fill, always
           dashed); the selection outline follows the settings. -->
      <rect
        x={part.box.left}
        y={part.box.top}
        width={part.box.width}
        height={part.box.height}
        stroke-width="1"
        stroke-dasharray="4 3"
        style={paint.css.marquee}
      />
    {:else if part.kind === 'outline'}
      <rect
        x={part.box.left}
        y={part.box.top}
        width={part.box.width}
        height={part.box.height}
        fill="none"
        style={paint.css.outline}
      />
    {/if}
  {/each}
</svg>
{#if yours.length > 0}
  <div style="position: absolute; inset: 0; pointer-events: none">
    {#each yours as part, index (index)}
      {#if part.kind === 'handle'}
        {@render handle?.({
          at: part.at,
          size: paint.chrome.handles.size,
          rotation: part.rotation,
          kind: part.role,
          active: part.active,
        })}
      {:else if part.kind === 'rotation-handle'}
        <!-- Your rotation handle stands still while it's dragged: the badge shows the angle. -->
        {@render rotationHandle?.({
          at: part.at,
          from: part.from,
          size: paint.chrome.rotationHandle.size,
          rotation: 0,
          active: false,
        })}
      {/if}
    {/each}
  </div>
{/if}
