<script lang="ts">
  import { useMeasurementEvent } from '@embedpdf/svelte/measurement';

  let message = $state('');

  useMeasurementEvent(
    (measurement) => measurement.onScaleChanged,
    () => (message = 'The scale changed'),
  );
</script>

<p aria-live="polite">{message}</p>
