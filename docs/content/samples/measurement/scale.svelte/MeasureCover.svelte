<!-- On load: a distance and an area on the cover, at 1:100, scrolled into view. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useMeasurement, usePageScale } from '@embedpdf/svelte/measurement';

  // The cover's empty lower half, where the measurements go.
  const LOWER_HALF = { x: 40, y: 560, width: 532, height: 210 };

  const measurement = useMeasurement();
  const stage = useStage();
  const scale = usePageScale(0);

  let started = false;
  $effect(() => {
    if (!scale.current.ready || started) return;
    started = true;
    untrack(() => {
      void measurement.setPreset(0, 'metric-100').then(() =>
        Promise.all([
          measurement.createMeasurement({
            kind: 'distance',
            page: 0,
            points: [
              { x: 60, y: 740 },
              { x: 550, y: 740 },
            ],
          }),
          measurement.createMeasurement({
            kind: 'area',
            page: 0,
            points: [
              { x: 60, y: 580 },
              { x: 260, y: 580 },
              { x: 260, y: 700 },
              { x: 60, y: 700 },
            ],
          }),
        ]).then(() => stage.reveal(0, { rect: LOWER_HALF })),
      );
    });
  });
</script>
