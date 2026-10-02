<!--
  The form's fields on one page, as real HTML controls people fill in, with or without the
  annotation plugin. The field's own picture (the engine's drawing of its value, borders and
  fonts) is drawn below it, by the `<RenderLayer>` raster or by the `<AnnotationLayer>` while the
  form plugin keeps widgets inert for filling. The controls add what people interact with:

    text      → the picture at rest; focus shows an editor in the field's font.
    toggle    → the picture is the control; a click writes the toggled value.
    combo     → an invisible native <select> over the picture.
    list      → a visible native <select>: one surface owns the rows, the keyboard and the
                scrolling.
    button    → a native click target over the picture that runs its action.
    signature → "sign here", or the signed field's details, with the signature plugin.

  It shows while the active tool fills forms (the `pointer` and `pan` tools do), and stands down
  in design mode, where fields are boxes you select and move. What the viewer draws itself (the
  focus ring, the edge of a field without a border, the editor) takes its colors from the form
  settings, which the `--epdf-form-*` CSS variables override. The colors, the field looks, the
  boxes' and controls' styles, and the toggle, text-field and list-box policies are
  `@embedpdf/web`'s, the same for every framework; every control keeps its presses from the
  Stage below (`WidgetBox.svelte`).
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // Loading a page's widgets and listing them as controls are host reads.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
  import { usePage } from '../runtime/page';
  import {
    shallowArray,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import ButtonControl from './ButtonControl.svelte';
  import ComboControl from './ComboControl.svelte';
  import ListControl from './ListControl.svelte';
  import { useFormColors } from './readers.svelte';
  import SignatureControl from './SignatureControl.svelte';
  import TextControl from './TextControl.svelte';
  import ToggleControl from './ToggleControl.svelte';

  const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

  const page = usePage();
  const form = useOptionalCapability(FormHostToken);
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

  // The page's widgets are read the first time the layer shows on it.
  $effect(() => {
    const lens = form.current;
    const ref = page.ref;
    if (lens && active.current) void lens.ensureLoaded(ref);
  });

  /**
   * One control per widget of a field (a radio group has a widget per button), made again for
   * another document: a text box keeps its field's editing policy for its life.
   */
  const keyOf = (item: FormWidgetItem) =>
    `${page.documentId}:${item.key}:${item.annotObjectNumber}`;
</script>

{#if active.current}
  <div style="position: absolute; inset: 0; pointer-events: none">
    {#each items.current as item (keyOf(item))}
      {#if item.control === 'text'}
        <TextControl {item} colors={colors.current} />
      {:else if item.control === 'toggle'}
        <ToggleControl {item} colors={colors.current} />
      {:else if item.control === 'choice' && item.kind === 'list'}
        <ListControl {item} colors={colors.current} />
      {:else if item.control === 'choice'}
        <ComboControl {item} colors={colors.current} />
      {:else if item.control === 'button'}
        <ButtonControl {item} colors={colors.current} />
      {:else if item.control === 'signature'}
        <SignatureControl {item} colors={colors.current} />
      {/if}
    {/each}
  </div>
{/if}
