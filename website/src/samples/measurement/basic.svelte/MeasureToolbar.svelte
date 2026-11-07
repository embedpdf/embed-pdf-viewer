<script lang="ts">
  import { untrack } from 'svelte';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useMeasurement, usePageScale } from '@embedpdf/svelte/measurement';

  const TOOLS = [
    { id: 'pointer', label: 'Select' },
    { id: 'distance', label: 'Distance' },
    { id: 'perimeter', label: 'Perimeter' },
    { id: 'area', label: 'Area' },
  ];

  const interaction = useInteraction();
  const activeToolId = useInteractionState((state) => state.activeToolId);
  const measurement = useMeasurement();
  const scale = usePageScale(0); // the floor plan's scale

  // On load: the floor plan at 1:100, the building's width measured, and the distance tool on.
  let started = false;
  $effect(() => {
    if (!scale.current.ready || started) return;
    started = true;
    untrack(() => {
      void measurement
        .setPreset(0, 'metric-100')
        .then(() =>
          measurement.createMeasurement({
            kind: 'distance',
            page: 0,
            points: [
              { x: 62, y: 150 },
              { x: 550, y: 150 },
            ],
          }),
        )
        .then(() => interaction.activateTool('distance'));
    });
  });
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    {#each TOOLS as tool (tool.id)}
      <button
        type="button"
        aria-pressed={activeToolId.current === tool.id}
        onclick={() => interaction.activateTool(tool.id)}
      >
        {tool.label}
      </button>
    {/each}
  </div>
  <span class="spacer"></span>
  <output class="badge">
    Scale {scale.current.measure?.subtype === 'rectilinear' ? scale.current.measure.ratio : '…'}
  </output>
</div>
