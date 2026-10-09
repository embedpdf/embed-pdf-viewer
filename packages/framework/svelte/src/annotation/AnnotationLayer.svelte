<!--
  A page's annotations, the selection's outline and handles, the tool's preview and the text boxes
  being typed in. Put it in the Stage's page content above the rendered page: while it's there,
  the render layer leaves the annotations out of the page's picture.

  Pure paint: it reads the plugin's per-page render items and chrome and draws them. Presses reach
  the plugin through the interaction hub (the Stage forwards them), and so does the cursor. Each
  annotation is one drawing: its vector scene, the engine's baked appearance, or a look of yours
  from `renderers`, which may keep the layer's own drawing (`{@render native()}`) and add to it.
  The `handle` and `rotationHandle` snippets draw the handles your way.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { annotationKey } from '@embedpdf/core';
  import type { RenderItem } from '@embedpdf/core-annotation';
  import type { TextItem } from '@embedpdf/plugin-annotation';
  // The layer is framework code, so it resolves the full host lens (page items, chrome,
  // appearances…): the same runtime token as the public one, typed wider.
  import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
  import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
  import {
    annotationDrawingOf,
    bakedAppearanceOf,
    createShownUrls,
    editingTextKeyOf,
    layerTextBoxesOf,
    loadAppearanceUrls,
    registerRendererBehaviors,
    type AnnotationDrawing,
    type AppearanceUrl,
  } from '@embedpdf/web';
  import { devWarn } from '../runtime/dev';
  import { usePage } from '../runtime/page';
  import { usePaintsPagePart } from '../runtime/page-layers.svelte';
  import {
    shallowArray,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import AnnotationChrome from './AnnotationChrome.svelte';
  import AnnotationFrame from './AnnotationFrame.svelte';
  import AnnotationLook from './AnnotationLook.svelte';
  import FreeTextBox from './FreeTextBox.svelte';
  import NativeDrawing from './NativeDrawing.svelte';
  import type { AnnotationLayerProps, AnnotationRenderer } from './props';
  import StampGhost from './StampGhost.svelte';

  type Drawing = AnnotationDrawing<AnnotationRenderer>;

  const NO_ITEMS: readonly RenderItem[] = Object.freeze([]);
  const NO_TEXTS: readonly TextItem[] = Object.freeze([]);
  const NATIVE: Drawing = { kind: 'native', inert: false };

  let { renderers, handle, rotationHandle }: AnnotationLayerProps = $props();

  const page = usePage();
  // While it's here, the page's picture leaves the annotations to it.
  usePaintsPagePart(() => page.ref, 'annotations');
  const annotation = useOptionalCapability(AnnotationHostToken);
  const interaction = useOptionalCapability(InteractionToken);
  // The active tool decides which interactive renderers take the pointer, so a tool change draws
  // the layer again (`interactive` functions read it live).
  const activeToolId = useOptionalSelector(
    InteractionToken,
    (hub) => String(hub.getActiveToolId()),
    '',
  );

  // The page's view (its zoom and turn) projects annotations that keep their size or stay
  // upright on screen (`noZoom`, `noRotate`) inside the plugin: no flag logic lives here.
  // `zoom`, not `viewScale`: 1 is the page's 100%.
  const items = useOptionalSelector(
    AnnotationHostToken,
    (host) =>
      host.listPageItems(page.ref, {
        zoom: page.transform.zoom,
        rotation: page.transform.rotation,
      }),
    NO_ITEMS,
    shallowArray,
  );
  const texts = useOptionalSelector(
    AnnotationHostToken,
    (host) =>
      host.listTextItems(page.ref, {
        zoom: page.transform.zoom,
        rotation: page.transform.rotation,
      }),
    NO_TEXTS,
    shallowArray,
  );

  // ── your renderers ─────────────────────────────────────────────────────────

  /** Bumped when the renderers' behaviors register again, so the drawings are read again. */
  let registrations = $state(0);
  let previousRenderers: AnnotationRenderer[] | undefined;
  // An `interactive` renderer takes the pointer through a behavior the plugin knows, registered
  // once per capability and entry however many pages mount the layer. Entry identity is the key,
  // so a list written inline in the markup registers again each time it's made: say so.
  $effect(() => {
    const host = annotation.current;
    const list = renderers;
    return untrack(() => {
      const before = previousRenderers;
      previousRenderers = list;
      if (list && before && list !== before && shallowArray(list, before)) {
        devWarn(
          'annotation-renderers-inline',
          '<AnnotationLayer renderers> was given a new array with the same entries — define it ' +
            'once in <script>, because entry identity keys the behavior registration.',
        );
      }
      if (!host || !list) return;
      const release = registerRendererBehaviors(host, list, () =>
        untrack(() => String(interaction.current?.getActiveToolId() ?? '')),
      );
      registrations++;
      return release;
    });
  });

  // ── baked appearances ──────────────────────────────────────────────────────

  let urls = $state.raw<Record<string, AppearanceUrl>>({});
  // The pictures shown stay valid until the next ones are shown.
  const shown = createShownUrls();
  $effect(() => () => shown.release());
  // Baked annotations draw from engine rasters: load them again when the page's baked set or an
  // appearance version changes (a stamp just placed, a resize whose new appearance arrived), and
  // when the bake scale does. A move or a turn leaves the epoch as it is (the same pixels, placed
  // elsewhere), and live gestures don't touch it: nothing loads mid-drag.
  const bakedKey = useOptionalSelector(
    AnnotationHostToken,
    (host) => host.getAppearanceEpoch(page.ref),
    null,
  );
  // The bake scale follows the document's render policy: zoom steps inside one rung of the
  // appearance lattice bake nothing again.
  const bakeScale = useOptionalSelector(
    AnnotationHostToken,
    (host) => host.getBakeScale(page.transform.renderScale),
    0,
  );
  $effect(() => {
    const host = annotation.current;
    const ref = page.ref;
    const scale = bakeScale.current;
    void bakedKey.current;
    if (!host || !scale) return;
    return untrack(() =>
      loadAppearanceUrls(
        shown,
        (signal) => host.renderAppearances(ref, scale, signal),
        annotationKey,
        (loaded) => (urls = loaded),
      ),
    );
  });

  // ── what each annotation draws ─────────────────────────────────────────────

  /** The text box being typed in, by key: while it is, a look's editor takes the keys. */
  const editingKey = $derived(editingTextKeyOf(texts.current, annotationKey));

  /**
   * Ownership beats looks: an engaged behavior's renderer is authoritative (the form plugin's
   * controls own their DOM); `for` rules apply only to what the layer owns, and draw without the
   * pointer. Read again when the item, the active tool or the registrations change: the
   * `interactive` functions and the plugin's behaviors are asked here.
   */
  function drawingOf(item: RenderItem): Drawing {
    void activeToolId.current;
    void registrations;
    const host = annotation.current;
    const record = item.annotation;
    if (!record || !host) return NATIVE;
    const typing = editingKey !== null && annotationKey(record.ref) === editingKey;
    return annotationDrawingOf(record, host, renderers, typing);
  }

  /** The text boxes the layer types in: one your renderer draws is edited there (`useRichTextEditor()`). */
  const ownTexts = $derived(
    layerTextBoxesOf(texts.current, items.current, renderers, annotationKey),
  );
</script>

<div style="position: absolute; inset: 0; pointer-events: none">
  {#each items.current as item (item.id)}
    {@const drawing = drawingOf(item)}
    {@const url = urls[item.id]?.url ?? null}
    <!-- The layer's own drawing, for a renderer to keep: `{@render native()}`. -->
    {#snippet native()}
      <NativeDrawing {item} {url} />
    {/snippet}
    <!-- The same in its frame, where the layer draws it: what a sibling plugin's renderer keeps. -->
    {#snippet framedNative()}
      <AnnotationFrame {item} {page}>
        <NativeDrawing {item} {url} />
      </AnnotationFrame>
    {/snippet}
    {#if drawing.kind === 'owned' && item.annotation}
      {@const Owner = drawing.entry.component}
      <Owner
        annotation={item.annotation}
        {item}
        {page}
        native={framedNative}
        hovered={item.hovered ?? false}
        selected={item.selected}
        interactive={true}
      />
    {:else if drawing.kind === 'look' && item.annotation}
      <AnnotationFrame {item} {page} interactive={drawing.interactive} inert={drawing.inert}>
        <AnnotationLook
          entry={drawing.entry}
          annotation={item.annotation}
          {item}
          {page}
          {native}
          appearance={bakedAppearanceOf(urls, item.id)}
          interactive={drawing.interactive}
        />
      </AnnotationFrame>
    {:else}
      <!-- Inert when an engaged behavior has no renderer of yours: its plugin owns the input (a
           link's anchor takes the click), and the annotation keeps its own look. -->
      <AnnotationFrame {item} {page} inert={drawing.kind === 'native' && drawing.inert}>
        <NativeDrawing {item} {url} />
      </AnnotationFrame>
    {/if}
  {/each}
  {#each ownTexts as text (text.id)}
    <FreeTextBox item={text} {page} />
  {/each}
  <StampGhost {page} />
  <AnnotationChrome {page} {handle} {rotationHandle} />
</div>
