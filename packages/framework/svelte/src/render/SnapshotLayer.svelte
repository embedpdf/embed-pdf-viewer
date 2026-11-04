<!--
  The `snapshot` tool's box on one page, while it's dragged and while it's held: the plugin's
  box in page space, in the page layer's pixels, in the plugin's `snapshot.box` colors, which the
  `--epdf-snapshot-box-*` CSS variables win over. It only draws; the tool's handler takes the
  pointer. Put it in each page, after the other layers.
-->
<script lang="ts">
  import { RENDER_DEFAULTS, RenderToken } from '@embedpdf/plugin-render/contract/host';
  import { rectInPixels, SNAPSHOT_BOX_DASH, snapshotBoxPaint } from '@embedpdf/web';
  import { useViewerSettings } from '../runtime/documents.svelte';
  import { usePage } from '../runtime/page';
  import { useOptionalSelector } from '../runtime/readers.svelte';

  const page = usePage();
  const box = useOptionalSelector(RenderToken, (render) => render.getSnapshotBox(page.ref), null);
  const colors = useOptionalSelector(
    RenderToken,
    (render) => render.getSettings().snapshot.box,
    RENDER_DEFAULTS.snapshot.box,
  );
  // Unset colors follow the viewer's accent, behind the `--epdf-accent` variable.
  const accent = useViewerSettings((settings) => settings.accent);

  const pixels = $derived(box.current && rectInPixels(box.current, page.transform));
  const paint = $derived(snapshotBoxPaint(colors.current, accent.current));
</script>

{#if pixels}
  <svg
    aria-hidden="true"
    width={pixels.width}
    height={pixels.height}
    style="position: absolute; left: {pixels.left}px; top: {pixels.top}px; overflow: visible; pointer-events: none;"
  >
    <!-- The colors go in `style`: an SVG attribute doesn't read var(). -->
    <rect
      width={pixels.width}
      height={pixels.height}
      stroke-width="1"
      stroke-dasharray={SNAPSHOT_BOX_DASH}
      style:fill={paint.fill}
      style:stroke={paint.stroke}
    />
  </svg>
{/if}
