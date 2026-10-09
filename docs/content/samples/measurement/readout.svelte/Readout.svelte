<!-- One measurement's readout: a click selects it on the page. -->
<script lang="ts">
  import { useAnnotation, type Annotation } from '@embedpdf/svelte/annotation';
  import { useMeasurementReadout } from '@embedpdf/svelte/measurement';

  let { annotation }: { annotation: Annotation } = $props();

  const readout = useMeasurementReadout(() => annotation.ref);
  const annotations = useAnnotation();
</script>

<li>
  <button type="button" class="row" onclick={() => annotations.selection.set([annotation.ref])}>
    <span class="kind">{'unavailable' in readout.current ? 'No scale' : readout.current.kind}</span>
    <span class="value">{'unavailable' in readout.current ? '—' : readout.current.label}</span>
  </button>
</li>
