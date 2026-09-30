<script lang="ts">
  import { useMeasurement, useMeasurementState } from '@embedpdf/svelte/measurement';

  import LengthPrompt from './LengthPrompt.svelte';

  const measurement = useMeasurement();
  const state = useMeasurementState();

  function apply(value: number) {
    const request = state.calibrationRequest;
    if (request) measurement.calibrate({ ...request, distance: { value, unit: 'cm' } });
  }
</script>

{#if state.calibrationRequest}
  <LengthPrompt onSubmit={apply} onCancel={() => measurement.dismissCalibration()} />
{/if}
