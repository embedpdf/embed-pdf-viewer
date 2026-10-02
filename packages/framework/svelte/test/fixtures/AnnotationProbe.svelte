<!-- Reads the annotation state and the anchor of `annotationRecords.target`, recording every change. -->
<script lang="ts">
  import { useAnnotationAnchor, useAnnotationState } from '../../src/annotation';
  import { annotationRecords } from './annotation-records';

  const annotationState = useAnnotationState();
  const anchor = useAnnotationAnchor(() => annotationRecords.target.value);

  $effect(() => {
    annotationRecords.states.push({
      selected: annotationState.selected,
      editing: annotationState.editing,
    });
  });
  $effect(() => {
    annotationRecords.anchors.push(anchor.current);
  });
</script>
