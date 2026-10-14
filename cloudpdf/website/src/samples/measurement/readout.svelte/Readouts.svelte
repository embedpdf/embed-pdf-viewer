<script lang="ts">
  import { annotationKey, useAnnotationList, type Annotation } from '@embedpdf/svelte/annotation';
  import Readout from './Readout.svelte';

  // A measurement is a line, polyline or polygon with a dimension intent.
  const isMeasurement = (annotation: Annotation) =>
    'intent' in annotation && !!annotation.intent?.endsWith('-dimension');

  const cover = useAnnotationList({ pages: [0] });
  const measurements = $derived(cover.current.filter(isMeasurement));
</script>

<ul class="readouts" aria-label="Measurements on the cover">
  {#each measurements as annotation (annotationKey(annotation.ref))}
    <Readout {annotation} />
  {/each}
</ul>
