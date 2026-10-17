<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotationList } from '@embedpdf/svelte/annotation';
  import {
    useMeasurement,
    usePageScale,
    type MeasurementKind,
  } from '@embedpdf/svelte/measurement';

  // Points on the cover's empty lower half, in page coordinates: two for a
  // distance, the corners otherwise.
  const SHAPES: Record<MeasurementKind, { x: number; y: number }[]> = {
    distance: [
      { x: 60, y: 750 },
      { x: 550, y: 750 },
    ],
    perimeter: [
      { x: 70, y: 600 },
      { x: 150, y: 650 },
      { x: 250, y: 600 },
    ],
    area: [
      { x: 70, y: 670 },
      { x: 250, y: 670 },
      { x: 250, y: 730 },
      { x: 70, y: 730 },
    ],
  };

  // The cover's empty lower half, where the measurements go.
  const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

  const measurement = useMeasurement();
  const stage = useStage();
  const scale = usePageScale(0);
  const cover = useAnnotationList({ pages: [0] });
  const count = $derived(
    cover.current.filter(
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
    {count === 1 ? 'measurement' : 'measurements'} on the cover
  </output>
</div>
