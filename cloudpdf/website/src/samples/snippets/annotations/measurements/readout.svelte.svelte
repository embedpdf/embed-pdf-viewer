<script lang="ts">
  import type { AnnotationRef } from '@embedpdf/svelte/annotation';
  import { useMeasurementReadout } from '@embedpdf/svelte/measurement';

  let { annotation }: { annotation: AnnotationRef } = $props();

  const readout = useMeasurementReadout(() => annotation);
  // readout.current: { kind: 'distance', value: 3.42, label: '3.42 m' }
</script>

<span>{'unavailable' in readout.current ? '—' : readout.current.label}</span>
