<!--
  The pictures of a page's fields, as the engine draws them, from the render plugin's shared field
  pictures. Every state is loaded, so a check box shows its new state as soon as its value
  changes; hidden widgets aren't drawn.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { annotationKey } from '@embedpdf/core';
  import {
    FormToken as FormHostToken,
    type ShownWidget,
  } from '@embedpdf/plugin-form/contract/host';
  import { RenderToken } from '@embedpdf/plugin-render/contract/host';
  import {
    loadFieldPictureUrls,
    rectInPixels,
    shownFieldPicture,
    type AppearanceUrl,
  } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import {
    shallowArray,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';

  const NO_WIDGETS: readonly ShownWidget[] = Object.freeze([]);

  const page = usePage();
  const render = useOptionalCapability(RenderToken);
  // The same list until a widget on this page changes.
  const widgets = useOptionalSelector(
    FormHostToken,
    (form) => form.listShownWidgets(page.ref),
    NO_WIDGETS,
    shallowArray,
  );
  // Loaded again when the page's fields change, and at appearance-scale crossings.
  const epoch = useOptionalSelector(
    RenderToken,
    (renderer) => renderer.getFieldAppearanceEpoch(page.ref),
    0,
  );
  const scale = useOptionalSelector(
    RenderToken,
    (renderer) => renderer.getAppearanceScale(page.transform.renderScale),
    0,
  );

  let urls = $state.raw<Record<string, AppearanceUrl>>({});
  $effect(() => {
    const renderer = render.current;
    const ref = page.ref;
    const at = scale.current;
    void epoch.current;
    if (!renderer || !at) return;
    return untrack(() =>
      loadFieldPictureUrls(
        (signal) => renderer.renderFieldAppearances(ref, { scale: at, signal }),
        annotationKey,
        (loaded) => (urls = loaded),
      ),
    );
  });

  const pictures = $derived(
    widgets.current.flatMap((widget) => {
      const key = annotationKey(widget.ref);
      const picture = shownFieldPicture(urls, key, widget.appearanceState);
      return picture
        ? [{ key, url: picture.url, frame: rectInPixels(picture.box, page.transform) }]
        : [];
    }),
  );
</script>

<!-- A global `img { max-width: 100% }` reset would clamp a picture: the sizes are explicit. -->
{#each pictures as picture (picture.key)}
  <img
    src={picture.url}
    alt=""
    draggable="false"
    style="position: absolute; max-width: none; max-height: none; pointer-events: none"
    style:left="{picture.frame.left}px"
    style:top="{picture.frame.top}px"
    style:width="{picture.frame.width}px"
    style:height="{picture.frame.height}px"
  />
{/each}
