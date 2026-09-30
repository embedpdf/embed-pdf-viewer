<script lang="ts">
  import { useRichTextEditor, type AnnotationRendererProps } from '@embedpdf/svelte/annotation';

  let { annotation, box, page }: AnnotationRendererProps = $props();

  const editor = useRichTextEditor(
    () => annotation,
    () => page,
  );
  const rect = $derived(page.transform.pageToViewRect(box));
</script>

<div
  {@attach editor.attach}
  class={['text-box', editor.editing && 'editing']}
  style="position: absolute; left: {rect.x}px; top: {rect.y}px; width: {rect.width}px; height: {rect.height}px; {editor.style}"
></div>
