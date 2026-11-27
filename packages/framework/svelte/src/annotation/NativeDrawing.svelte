<!--
  The layer's own drawing of one annotation, inside its frame: the engine's raster where the core
  places it (following a move as it happens), or the vector scene for everything drawn live (a
  picture older than the annotation too). One rule picks (`pictureOrPainting`). A lent record's
  accent (a form field's tint) fills the frame above it, or its outline edges it, and its
  placeholder (what an empty field is for) is written over both; a tool's ghost carries them
  too, see-through as its drawing is. A renderer gets it all as `native`. One block holds the
  three, so a record with none is drawn as it always was. A block follows the one before it
  with no blank between them (`{/if}{#if`): Svelte keeps a blank between two blocks as a text
  node, in every frame. A line break just inside a block or an element is dropped.
-->
<script lang="ts">
  import { hasLiveDrawing, type RenderItem } from '@embedpdf/core-annotation';
  import {
    cssText,
    frameInPixels,
    ghostOpacity,
    pictureOrPainting,
    rasterInFrame,
    recordAccentStyleOf,
    recordOutlineStyleOf,
    recordPlaceholderStyleOf,
    shownAppearance,
    type AppearanceUrl,
  } from '@embedpdf/web';
  import { useViewerSettings } from '../runtime/documents.svelte';
  import { usePage } from '../runtime/page';
  import AnnotationScene from './AnnotationScene.svelte';

  let {
    item,
    urls,
  }: {
    item: RenderItem;
    /** The page's loaded pictures, by item and state; `null` until the first ones arrive. */
    urls: Readonly<Record<string, AppearanceUrl>> | null;
  } = $props();

  const shows = $derived(
    pictureOrPainting({
      pending: item.source !== 'baked',
      picture: urls && shownAppearance(urls, item.id, item.annotation?.appearanceState ?? null),
      version: item.pictureVersion ?? 0,
      loaded: urls !== null,
      paint: () => (hasLiveDrawing(item) ? item : null),
    }),
  );
  const raster = $derived(item.raster ? rasterInFrame(item.raster, item.frame) : null);

  // A placeholder is written in the record's own text size and alignment, in its frame on the
  // page. Worked out only for a record that has one: nothing else reads it.
  const page = usePage();
  // A ghost's paint is see-through, as its drawing is.
  const seeThrough = $derived(
    item.source === 'ghost' ? `opacity: ${ghostOpacity(item.ghostOpacity ?? 0.5)}` : '',
  );
  const withGhost = (css: string): string => [css, seeThrough].filter(Boolean).join('; ');
  const placeholderStyle = $derived(
    item.placeholder
      ? withGhost(
          cssText(
            recordPlaceholderStyleOf(
              item.placeholder,
              // A ghost has no record yet: its text style is the field's to be.
              (item.annotation ?? item.text ?? null) as {
                fontSize?: number | null;
                textAlign?: string | null;
              } | null,
              item.frame.box,
              frameInPixels(item.frame, page.transform),
            ),
          ),
        )
      : undefined,
  );
  // A lent field's outline is the form's edge, which follows the viewer's accent.
  const viewerAccent = useViewerSettings((settings) => settings.accent);
</script>

{#if shows?.kind === 'painting'}
  <!-- Shapes, clouds, markup: all painted from the scene. -->
  <AnnotationScene {item} />
{:else if shows?.kind === 'picture' && raster}
  <!-- The raster at any frame size. Explicit `max-width`/`max-height`: a global
       `img { max-width: 100% }` reset would clamp a box wider than its containing block (a
       landscape stamp on a turned portrait page) and distort it. The turn the engine took out of
       the raster is put back about its middle. -->
  <img
    src={shows.picture.url}
    alt=""
    draggable="false"
    style:position="absolute"
    style:left={raster.left}
    style:top={raster.top}
    style:width={raster.width}
    style:height={raster.height}
    style:max-width="none"
    style:max-height="none"
    style:pointer-events="none"
    style:transform={raster.transform}
    style:transform-origin="center"
  />
{/if}{#if item.accent || item.outline || item.placeholder}
  {#if item.accent}
    <div style={withGhost(cssText(recordAccentStyleOf(item.accent)))}></div>
  {/if}{#if item.outline}
    <div
      data-epdf-outline=""
      style={withGhost(cssText(recordOutlineStyleOf(item.outline, viewerAccent.current)))}
    ></div>
  {/if}{#if item.placeholder}
    <span aria-hidden="true" data-epdf-placeholder="" style={placeholderStyle}>
      {item.placeholder.text}
    </span>
  {/if}
{/if}
