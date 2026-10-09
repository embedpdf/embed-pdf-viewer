<script lang="ts">
  import {
    useMeasurement,
    useMeasurementState,
    usePageScale,
    type AreaUnit,
    type LengthUnit,
  } from '@embedpdf/svelte/measurement';

  // Precision is steps per unit: 100 shows two decimals.
  const PRECISIONS = [1, 10, 100, 1000];

  const measurement = useMeasurement();
  const busy = useMeasurementState((state) => state.busy);
  const scale = usePageScale(0);
  let preset = $state('metric-100');
  let unit = $state<LengthUnit>('m');
  let areaUnit = $state<AreaUnit>('m2');
  let precision = $state(100);

  // Every change recalculates the measurements already on the page.
  function choosePreset(event: Event & { currentTarget: HTMLSelectElement }) {
    preset = event.currentTarget.value;
    void measurement.setPreset(0, preset);
  }
  function chooseUnit(event: Event & { currentTarget: HTMLSelectElement }) {
    unit = event.currentTarget.value as LengthUnit;
    void measurement.setUnit(0, unit);
  }
  function chooseAreaUnit(event: Event & { currentTarget: HTMLSelectElement }) {
    areaUnit = event.currentTarget.value as AreaUnit;
    void measurement.setAreaUnit(0, areaUnit);
  }
  function choosePrecision(event: Event & { currentTarget: HTMLSelectElement }) {
    precision = Number(event.currentTarget.value);
    void measurement.setPrecision(0, precision);
  }
</script>

<div class="toolbar">
  <label class="label">
    Scale
    <select class="field" value={preset} disabled={busy.current} onchange={choosePreset}>
      {#each measurement.listPresets() as choice (choice.id)}
        <option value={choice.id}>{choice.label}</option>
      {/each}
    </select>
  </label>
  <label class="label">
    Length
    <select class="field" value={unit} disabled={busy.current} onchange={chooseUnit}>
      {#each measurement.listUnits() as choice (choice)}
        <option value={choice}>{choice}</option>
      {/each}
    </select>
  </label>
  <label class="label">
    Area
    <select class="field" value={areaUnit} disabled={busy.current} onchange={chooseAreaUnit}>
      {#each measurement.listAreaUnits() as choice (choice)}
        <option value={choice}>{choice}</option>
      {/each}
    </select>
  </label>
  <label class="label">
    Steps
    <select class="field" value={precision} disabled={busy.current} onchange={choosePrecision}>
      {#each PRECISIONS as choice (choice)}
        <option value={choice}>{choice === 1 ? 'Whole' : `1/${choice}`}</option>
      {/each}
    </select>
  </label>
  <span class="spacer"></span>
  <output class="badge">
    {scale.current.measure?.subtype === 'rectilinear' ? scale.current.measure.ratio : '…'}
  </output>
</div>
