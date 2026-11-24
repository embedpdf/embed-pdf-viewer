<!--
  The form's fields on one page, painted as the engine draws them (their values, borders and
  fonts), with real HTML controls people fill them in with, with or without the annotation
  plugin. While it's on the page, the `<RenderLayer>` leaves the fields out of the page's picture.
  The controls add what people interact with on top of the pictures:

    text      → the picture at rest; focus shows an editor in the field's font.
    toggle    → the picture is the control; a click writes the toggled value.
    combo     → an invisible native <select> over the picture.
    list      → a visible native <select>: one surface owns the rows, the keyboard and the
                scrolling.
    button    → a native click target over the picture that runs its action.
    signature → "sign here", or the signed field's details, with the signature plugin.

  The controls show while the active tool fills forms (the `pointer` and `pan` tools do), and
  stand down in design mode, where fields are boxes you select and move. What the viewer draws itself (the
  focus ring, the edge of a field without a border, the editor) takes its colors from the form
  settings, which the `--epdf-form-*` CSS variables override. The colors, the field looks, the
  boxes' and controls' styles, and the toggle, text-field and list-box policies are
  `@embedpdf/web`'s, the same for every framework; every control keeps its presses from the
  Stage below (`WidgetBox.svelte`).

  `controls` draws some boxes with components of the app's own (`CustomControl.svelte`), which
  show and stand down with the layer's own. A box one of them draws has its picture inside the
  control's `native`, so the layer leaves it out of the pictures it draws itself.
-->
<script lang="ts">
  import { annotationKey } from '@embedpdf/core';
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // Loading a page's widgets and listing them as controls are host reads.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
  import { fieldControlFor, rectInPixels } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { usePaintsPagePart } from '../runtime/page-layers.svelte';
  import {
    shallowArray,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import CustomControl from './CustomControl.svelte';
  import { useFieldLooks, type ShownLook } from './field-looks.svelte';
  import FieldPicture from './FieldPicture.svelte';
  import NativeControl from './NativeControl.svelte';
  import type { FieldControl, FormLayerProps } from './props';
  import { useFormColors } from './readers.svelte';

  let { controls }: FormLayerProps = $props();

  const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

  const page = usePage();
  const form = useOptionalCapability(FormHostToken);
  // While it's here with the form plugin, the page's picture leaves the fields to it.
  usePaintsPagePart(() => (form.current ? page.ref : null), 'formFields');
  const colors = useFormColors();
  const active = useOptionalSelector(
    InteractionToken,
    (interaction) => interaction.activeToolEnables('form-fill'),
    false,
  );
  // The same list until a widget on this page changes.
  const items = useOptionalSelector(
    FormHostToken,
    (lens) => lens.listWidgets(page.ref),
    NO_WIDGETS,
    shallowArray,
  );

  // The page's widgets are read when the layer comes to it.
  $effect(() => {
    const lens = form.current;
    const ref = page.ref;
    if (lens) void lens.ensureLoaded(ref);
  });

  // The page's fields as they look now: drawn here, or inside a control of the app's.
  const looks = useFieldLooks();
  const lookOf = $derived(new Map(looks.current.map((look) => [look.key, look])));

  /**
   * The boxes a control of the app's draws, by widget: `null` without `controls`, and while the
   * layer's own stand down. `null`, not an empty map, and `controls` asked first: a layer
   * without controls then reads no widget and no look to look one up, so nothing here runs
   * again per box when the page's widgets or the active tool change.
   */
  const custom = $derived.by(() => {
    if (!controls?.length || !active.current) return null;
    const drawn = new Map<string, FieldControl>();
    for (const item of items.current) {
      const control = fieldControlFor(item, controls);
      if (control) drawn.set(annotationKey(item.ref), control);
    }
    return drawn;
  });

  /** Where a widget is now, in the page layer: a move keeps its picture, which comes along. */
  function inPage(look: ShownLook) {
    const frame = rectInPixels(look.rect, page.transform);
    return {
      left: `${frame.left}px`,
      top: `${frame.top}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
    };
  }

  /**
   * One control per widget of a field (a radio group has a widget per button), made again for
   * another document: a text box keeps its field's editing policy for its life.
   */
  const keyOf = (item: FormWidgetItem) =>
    `${page.documentId}:${item.key}:${item.annotObjectNumber}`;
</script>

<div style="position: absolute; inset: 0; pointer-events: none">
  {#each looks.current as look (look.key)}
    {#if !custom?.has(look.key)}
      <FieldPicture {look} place={inPage(look)} />
    {/if}
  {/each}
  {#if active.current}
    {#each items.current as item (keyOf(item))}
      {@const control = custom?.get(annotationKey(item.ref))}
      {#if control}
        <CustomControl
          {item}
          {control}
          colors={colors.current}
          look={lookOf.get(annotationKey(item.ref)) ?? null}
        />
      {:else}
        <NativeControl {item} colors={colors.current} />
      {/if}
    {/each}
  {/if}
</div>
