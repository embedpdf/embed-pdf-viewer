<script lang="ts">
  import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { annotation }: AnnotationRendererProps = $props();

  const editor = useRichTextEditor(() => annotation);
</script>

<!-- The element fills its frame (`width` and `height` 100% in your CSS). -->
<div
  {@attach editor.attach}
  class={['text-box', editor.editing && 'editing']}
  style={editor.style}
></div>
