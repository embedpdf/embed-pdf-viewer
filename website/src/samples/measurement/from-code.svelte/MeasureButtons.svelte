<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotationList } from '@embedpdf/svelte/annotation';
  import {
    useMeasurement,
    usePageScale,
    type MeasurementKind,
  } from '@embedpdf/svelte/measurement';

  // Points on the floor plan, in page coordinates: two for a
  // distance, the corners otherwise.
  const SHAPES: Record<MeasurementKind, { x: number; y: number }[]> = {
    distance: [
      { x: 62, y: 723 },
      { x: 550, y: 723 },
    ],
    perimeter: [
      { x: 62, y: 613 },
      { x: 382, y: 613 },
      { x: 382, y: 723 },
    ],
    area: [
      { x: 382, y: 516 },
      { x: 550, y: 516 },
      { x: 550, y: 723 },
      { x: 382, y: 723 },
    ],
  };

  // The floor plan's lower half, where the measurements go.
  const LOWER_HALF = { x: 50, y: 500, width: 512, height: 240 };

  const measurement = useMeasurement();
  const stage = useStage();
  const scale = usePageScale(0);
  const onPlan = useAnnotationList({ pages: [0] });
  const count = $derived(
    onPlan.current.filter(
      (annotation) => 'intent' in annotation && !!annotation.intent?.endsWith('-dimension'),
    ).length,
  );

  // The same measurement the tool makes, with the page's scale and the tool's style.
  function measure(kind: MeasurementKind) {
    void measurement.createMeasurement({ kind, page: 0, points: SHAPES[kind] });
  }

  // On load: an area, scrolled into view.
  let started = false;
  $effect(() => {
    if (!scale.current.ready || started) return;
    started = true;
    untrack(() => {
      void measurement
        .createMeasurement({ kind: 'area', page: 0, points: SHAPES.area })
        .then(() => stage.reveal(0, { rect: LOWER_HALF }));
    });
  });
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!scale.current.ready}
    onclick={() => measure('distance')}
  >
    Distance
  </button>
  <button
    type="button"
    class="button"
    disabled={!scale.current.ready}
    onclick={() => measure('perimeter')}
  >
    Perimeter
  </button>
  <button type="button" class="button" disabled={!scale.current.ready} onclick={() => measure('area')}>
    Area
  </button>
  <span class="spacer"></span>
  <output class="readout">
    {count}
    {count === 1 ? 'measurement' : 'measurements'} on the plan
  </output>
</div>
