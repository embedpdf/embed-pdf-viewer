<!-- A renderer that records the props it gets and draws the annotation's kind. -->
<script lang="ts">
  import type { AnnotationRendererProps } from '../../src/annotation';
  import { annotationRecords } from './annotation-records';

  let props: AnnotationRendererProps = $props();

  $effect(() => {
    annotationRecords.looks.push({
      annotation: props.annotation,
      frame: props.frame,
      appearance: props.appearance,
      hovered: props.hovered,
      selected: props.selected,
      interactive: props.interactive,
    });
  });
</script>

<span data-testid="look">{props.annotation.subtype}</span>
