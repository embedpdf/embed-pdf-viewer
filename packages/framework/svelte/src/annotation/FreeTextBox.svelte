<!--
  A free text annotation's text: the same styled element for reading and typing, placed on the
  engine's text plate (the box inset by its padding). The editor owns what's inside the element,
  so the markup leaves it empty, and the element is never made again while someone types (the
  caret would jump). Every style is its own `style:` directive, so the editor's own line height
  on the element stays.
-->
<script lang="ts">
  import type { TextItem } from '@embedpdf/plugin-annotation';
  import { textBoxStyleOf, textPlateInPixels } from '@embedpdf/web';
  import type { PageContextValue } from '../runtime/page';
  import { useChromePaint } from './chrome-paint.svelte';
  import { textBoxEditor } from './text-box.svelte';

  let { item, page }: { item: TextItem; page: PageContextValue } = $props();

  const plate = $derived(textPlateInPixels(item, page.transform));
  const text = $derived(textBoxStyleOf(item.css, plate.scale));
  const paint = useChromePaint();
  const editor = textBoxEditor(
    () => item,
    () => plate.scale,
  );
</script>

<!-- Fixed to the plate: the box never grows with its text; it scrolls while typing and clips
     otherwise, where the baked appearance clips. Its fill and border are the scene's, under this
     layer. A plain text box turns about its centre, as the baked appearance does. Not typing,
     presses fall through to the shapes (select, move, resize). -->
<div
  {@attach editor}
  style:position="absolute"
  style:left="{plate.left}px"
  style:top="{plate.top}px"
  style:width="{plate.width}px"
  style:height="{plate.height}px"
  style:font-family={text.fontFamily}
  style:font-size={text.fontSize}
  style:color={text.color}
  style:font-weight={text.fontWeight}
  style:font-style={text.fontStyle}
  style:text-decoration={text.textDecoration}
  style:text-align={text.textAlign}
  style:box-sizing="border-box"
  style:background="transparent"
  style:white-space="pre-wrap"
  style:overflow-wrap="break-word"
  style:overflow-y={item.editing ? 'auto' : 'hidden'}
  style:overflow-x="hidden"
  style:outline={item.editing ? `1px solid ${paint.css.textOutline}` : 'none'}
  style:cursor={item.editing ? 'text' : 'default'}
  style:transform={item.rot ? `rotate(${item.rot}deg)` : undefined}
  style:transform-origin={item.rot ? 'center' : undefined}
  style:pointer-events={item.editing ? 'auto' : 'none'}
></div>
