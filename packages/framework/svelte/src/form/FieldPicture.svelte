<!--
  One widget as it looks now (`field-looks.svelte.ts`), at `place`: where the widget stands, in
  the page layer or inside its own box. Its picture and the painter's drawing both fill the rect
  the widget stands in, with its turn in them: a moved widget keeps its picture and takes it
  along.
-->
<script lang="ts">
  import type { FieldPictureStyle } from '@embedpdf/web';
  import SvgShapes from '../runtime/SvgShapes.svelte';
  import type { ShownLook } from './field-looks.svelte';

  let {
    look,
    place,
  }: {
    look: ShownLook;
    /** Where it goes, each length with its unit; `transform` undoes a turned box's turn. */
    place: Pick<FieldPictureStyle, 'left' | 'top' | 'width' | 'height' | 'transform'>;
  } = $props();
</script>

{#if look.painting}
  <svg
    viewBox={look.painting.viewBox}
    style="position: absolute; overflow: visible; pointer-events: none"
    style:left={place.left}
    style:top={place.top}
    style:width={place.width}
    style:height={place.height}
    style:transform={place.transform}
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
    style:left={place.left}
    style:top={place.top}
    style:width={place.width}
    style:height={place.height}
    style:transform={place.transform}
  />
{/if}
