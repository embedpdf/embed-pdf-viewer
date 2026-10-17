<script lang="ts">
  import { untrack } from 'svelte';
  import { useInteraction } from '@embedpdf/svelte/interaction';
  import {
    useMeasurement,
    useMeasurementState,
    usePageScale,
    type LengthUnit,
  } from '@embedpdf/svelte/measurement';

  const measurement = useMeasurement();
  const interaction = useInteraction();
  const measurementState = useMeasurementState();
  const scale = usePageScale(0);
  let length = $state(20);
  let unit = $state<LengthUnit>('cm');

  // On load: calibrating, so the next line you drag is the known length.
  let started = false;
  $effect(() => {
    if (!scale.current.ready || started) return;
    started = true;
    untrack(() => {
      if (measurement.canCalibrate()) measurement.startCalibration();
    });
  });

  // The plugin asks for the real length of the line you drew.
  function setScale(event: SubmitEvent) {
    event.preventDefault();
    const request = measurementState.calibrationRequest;
    if (!request) return;
    void measurement
      .calibrate({ ...request, distance: { value: length, unit } })
      .then(() => interaction.activateTool('distance'));
  }
</script>

{#if measurementState.calibrationRequest}
  <form class="toolbar" onsubmit={setScale}>
    <span class="readout">That line is</span>
    <input
      class="field length"
      type="number"
      min="0"
      step="any"
      aria-label="Its real length"
      bind:value={length}
    />
    <select class="field" aria-label="Unit" bind:value={unit}>
      {#each measurement.listUnits() as choice (choice)}
        <option value={choice}>{choice}</option>
      {/each}
    </select>
    <button type="submit" class="button" disabled={measurementState.busy || !(length > 0)}>
      Set the scale
    </button>
    <button type="button" class="button" onclick={() => measurement.dismissCalibration()}>
      Cancel
    </button>
  </form>
{:else}
  <div class="toolbar">
    <button
      type="button"
      class="button"
      disabled={!measurement.canCalibrate()}
      onclick={() => measurement.startCalibration()}
    >
      Calibrate
    </button>
    <output class="readout">
      Drag along something you know the length of, then measure with the new scale
    </output>
    <span class="spacer"></span>
    <output class="badge">
      {scale.current.measure?.subtype === 'rectilinear' ? scale.current.measure.ratio : '…'}
    </output>
  </div>
{/if}
