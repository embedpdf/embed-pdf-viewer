<!--
  Your own text box, in your app's look: it fills its frame, which the layer places and turns like
  the text box. The element inside is the editor and fills the box, so the box draws the fill,
  border and padding.
-->
<script lang="ts">
  import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { annotation }: AnnotationRendererProps = $props();

  const editor = useRichTextEditor(() => annotation);
</script>

<div class={['text-box', editor.editing && 'editing']}>
  <div {@attach editor.attach} style={editor.style}></div>
</div>
