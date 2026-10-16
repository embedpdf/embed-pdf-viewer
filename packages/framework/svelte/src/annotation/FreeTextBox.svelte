<!--
  A free text annotation's text: the same styled element for reading and typing, placed on the
  engine's text plate (the box inset by its padding). The editor owns what's inside the element,
  so the markup leaves it empty, and the element is never made again while someone types (the
  caret would jump). Every style is its own `style:` directive, so the editor's own line height
  on the element stays.
-->
<script lang="ts">
  import type { TextItem } from '@embedpdf/plugin-annotation';
  import { freeTextBoxOf } from '@embedpdf/web';
  import type { PageContextValue } from '../runtime/page';
  import { useChromePaint } from './chrome-paint.svelte';
  import { textBoxEditor } from './text-box.svelte';

  let { item, page }: { item: TextItem; page: PageContextValue } = $props();

  const paint = useChromePaint();
  // On the engine's text plate (the box inset by its padding), laid out at a legible size.
  const box = $derived(freeTextBoxOf(item, page.transform, paint.css.textOutline));
  const editor = textBoxEditor(
    () => item,
    () => box.scale,
  );
</script>

<div
  {@attach editor}
  style:position={box.style.position}
  style:left={box.style.left}
  style:top={box.style.top}
  style:width={box.style.width}
  style:height={box.style.height}
  style:font-family={box.style.fontFamily}
  style:font-size={box.style.fontSize}
  style:color={box.style.color}
  style:font-weight={box.style.fontWeight}
  style:font-style={box.style.fontStyle}
  style:text-decoration={box.style.textDecoration}
  style:text-align={box.style.textAlign}
  style:box-sizing={box.style.boxSizing}
  style:background={box.style.background}
  style:white-space={box.style.whiteSpace}
  style:overflow-wrap={box.style.overflowWrap}
  style:overflow-x={box.style.overflowX}
  style:overflow-y={box.style.overflowY}
  style:outline={box.style.outline}
  style:cursor={box.style.cursor}
  style:transform={box.style.transform}
  style:transform-origin={box.style.transformOrigin}
  style:pointer-events={box.style.pointerEvents}
></div>
