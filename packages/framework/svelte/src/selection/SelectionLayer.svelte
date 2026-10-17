<!--
  The highlight of the selected text on one page. It only paints: it warms the page's text
  geometry when it mounts, reads the page-space highlight from the plugin and maps each piece
  through the page's transform, in the plugin's `color` setting, which the
  `--epdf-text-selection` CSS variable wins over. Pointer input is `<PagePointerSource>`'s.

  It reads the host lens (`/contract/host`: geometry warming, the highlight handshake), which
  exists for exactly this; app code gets the public lens from `useSelection()`.
-->
<script lang="ts">
  import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';
  import type { SelectionSegment } from '@embedpdf/plugin-selection';
  import { mixAccent, paint, quadInPixels, svgPoints } from '@embedpdf/web';
  import { useViewerSettings } from '../runtime/documents.svelte';
  import { usePage } from '../runtime/page';
  import {
    shallowArray,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import { useSelectionSettings } from './readers.svelte';

  const NO_SEGMENTS: readonly SelectionSegment[] = Object.freeze([]);

  const page = usePage();
  const selection = useOptionalCapability(SelectionToken);
  const segments = useOptionalSelector(
    SelectionToken,
    (lens) => lens.listSegments(page.ref),
    NO_SEGMENTS,
    shallowArray,
  );
  // Code that draws its own selection (a markup tool's preview) can take the highlight over;
  // then this draws nothing, so the two never overlap.
  const visible = useOptionalSelector(SelectionToken, (lens) => lens.isHighlightVisible(), false);
  // Settings need no document; without the selection plugin this throws now, with the fix.
  const color = useSelectionSettings((settings) => settings.color);
  // An unset color follows the viewer's accent, behind the `--epdf-accent` variable.
  const accent = useViewerSettings((settings) => settings.accent);

  // Warm this page's text geometry as soon as it's on screen, so the first press can hit-test
  // without waiting for the engine. Nothing warms without the `doc.text.select` permission.
  $effect(() => {
    const lens = selection.current;
    const ref = page.ref;
    if (!lens) return;
    void lens.ensureLoaded(ref);
  });

  // Unset, the color is the accent at 35%, the accent variables included.
  const fill = $derived(
    paint('text-selection', color.current ?? mixAccent('text-selection', accent.current)),
  );
</script>

{#if visible.current}
  <svg
    style="position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none"
  >
    {#each segments.current as segment, index (index)}
      <!-- Page space to the page layer's pixels, which turn with the page: mapping the four
           corners is exact, for turned text too. The fill is in `style`: an SVG attribute
           doesn't read var(). -->
      <polygon points={svgPoints(quadInPixels(segment.quad, page.transform))} style:fill />
    {/each}
  </svg>
{/if}
