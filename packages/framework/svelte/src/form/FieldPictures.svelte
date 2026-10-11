<!--
  The page's fields as they look now. Each widget shows its picture, as the engine draws it (the
  form plugin's, every state loaded, so a check box shows its new state at once), or the painter's
  drawing while its look is pending or its picture is of an older version (`pictureOrPainting`): a
  value, a calculation, a restyle shows at once. Hidden widgets aren't drawn.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { annotationKey } from '@embedpdf/core';
  import { MITER_LIMIT } from '@embedpdf/core-annotation';
  import {
    FormToken as FormHostToken,
    type ShownWidget,
  } from '@embedpdf/plugin-form/contract/host';
  import { RenderToken } from '@embedpdf/plugin-render/contract/host';
  import {
    createShownUrls,
    loadAppearanceUrls,
    pictureOrPainting,
    rectInPixels,
    shownAppearance,
    svgShapesOf,
    type AppearanceUrl,
    type PixelRect,
    type SvgShape,
  } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import {
    shallowArray,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import SvgShapes from '../runtime/SvgShapes.svelte';

  const NO_WIDGETS: readonly ShownWidget[] = Object.freeze([]);

  /** A widget as the template draws it: its picture, or the painter's shapes in its box. */
  interface ShownLook {
    key: string;
    frame: PixelRect;
    url: string | null;
    painting: { viewBox: string; shapes: SvgShape[] } | null;
  }

  const page = usePage();
  const form = useOptionalCapability(FormHostToken);
  // The same list until a widget on this page changes.
  const widgets = useOptionalSelector(
    FormHostToken,
    (form) => form.listShownWidgets(page.ref),
    NO_WIDGETS,
    shallowArray,
  );
  // Loaded again when one of the page's widgets is drawn again, and at appearance-scale crossings.
  const epoch = useOptionalSelector(FormHostToken, (form) => form.getAppearanceEpoch(page.ref), '');
  const scale = useOptionalSelector(
    RenderToken,
    (renderer) => renderer.getAppearanceScale(page.transform.renderScale),
    0,
  );

  // `null` until the page's first pictures arrive.
  let urls = $state.raw<Record<string, AppearanceUrl> | null>(null);
  // The pictures shown stay valid until the next ones are shown.
  const shown = createShownUrls();
  $effect(() => () => shown.release());
  $effect(() => {
    const host = form.current;
    const ref = page.ref;
    const at = scale.current;
    void epoch.current;
    if (!host || !at) return;
    return untrack(() =>
      loadAppearanceUrls(
        shown,
        (signal) => host.renderAppearances(ref, at, signal),
        annotationKey,
        (loaded) => (urls = loaded),
      ),
    );
  });

  const looks = $derived(
    widgets.current.flatMap((widget): ShownLook[] => {
      const key = annotationKey(widget.ref);
      const look = pictureOrPainting({
        pending: widget.pending,
        picture: urls && shownAppearance(urls, key, widget.appearanceState),
        version: widget.pictureVersion,
        loaded: urls !== null,
        paint: () => form.current?.getWidgetPainting(widget.ref) ?? null,
      });
      if (!look) return [];
      if (look.kind === 'picture') {
        return [
          {
            key,
            url: look.picture.url,
            painting: null,
            frame: rectInPixels(look.picture.box, page.transform),
          },
        ];
      }
      const { x, y, width, height } = widget.rect;
      return [
        {
          key,
          url: null,
          painting: {
            viewBox: `${x} ${y} ${width} ${height}`,
            shapes: svgShapesOf(look.painting.scene, { miterLimit: MITER_LIMIT }),
          },
          frame: rectInPixels(widget.rect, page.transform),
        },
      ];
    }),
  );
</script>

{#each looks as look (look.key)}
  {#if look.painting}
    <svg
      viewBox={look.painting.viewBox}
      style="position: absolute; overflow: visible; pointer-events: none"
      style:left="{look.frame.left}px"
      style:top="{look.frame.top}px"
      style:width="{look.frame.width}px"
      style:height="{look.frame.height}px"
    >
      <SvgShapes shapes={look.painting.shapes} />
    </svg>
  {:else if look.url}
    <!-- A global `img { max-width: 100% }` reset would clamp a picture: the sizes are explicit. -->
    <img
      src={look.url}
      alt=""
      draggable="false"
      style="position: absolute; max-width: none; max-height: none; pointer-events: none"
      style:left="{look.frame.left}px"
      style:top="{look.frame.top}px"
      style:width="{look.frame.width}px"
      style:height="{look.frame.height}px"
    />
  {/if}
{/each}
