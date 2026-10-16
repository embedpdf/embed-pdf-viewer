<script lang="ts">
  import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { annotation }: AnnotationRendererProps = $props();

  const editor = useRichTextEditor(() => annotation);
</script>

<!-- The box fills its frame (`width` and `height` 100% in your CSS) and draws it; the editor
     inside fills the box. -->
<div class={['text-box', editor.editing && 'editing']}>
  <div {@attach editor.attach} style={editor.style}></div>
</div>
