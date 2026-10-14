<!--
  Your own text box: the element is the editor, in your app's look. It fills its frame, which the
  layer places and turns like the text box.
-->
<script lang="ts">
  import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { annotation }: AnnotationRendererProps = $props();

  const editor = useRichTextEditor(() => annotation);
</script>

<div
  {@attach editor.attach}
  class={['text-box', editor.editing && 'editing']}
  style={editor.style}
></div>
