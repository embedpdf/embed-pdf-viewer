<!-- A renderer that draws its own text box with `useRichTextEditor()`, recording whether it's typing. -->
<script lang="ts">
  import { annotationKey } from '@embedpdf/core';
  import { useRichTextEditor, type AnnotationRendererProps } from '../../src/annotation';
  import { annotationRecords } from './annotation-records';

  let { annotation }: AnnotationRendererProps = $props();

  const editor = useRichTextEditor(() => annotation);
  const key = $derived(annotationKey(annotation.ref));

  $effect(() => {
    annotationRecords.editing.set(key, editor.editing);
  });
</script>

<div {@attach editor.attach} data-testid={key} style={editor.style}></div>
