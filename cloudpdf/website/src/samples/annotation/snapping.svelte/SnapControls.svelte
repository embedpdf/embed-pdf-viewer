<script lang="ts">
  import { useAnnotation, useAnnotationSettings } from '@embedpdf/svelte/annotation';

  const QUARTERS = [0, 90, 180, 270];
  const EIGHTHS = [0, 45, 90, 135, 180, 225, 270, 315];

  const annotation = useAnnotation();
  const snap = useAnnotationSettings((settings) => settings.snap);
</script>

<div class="toolbar">
  <label class="check">
    <input
      type="checkbox"
      checked={snap.current.alignment}
      onchange={(event) =>
        annotation.updateSettings({ snap: { alignment: event.currentTarget.checked } })}
    />
    Snap to other annotations
  </label>
  <label class="check">
    <input
      type="checkbox"
      checked={snap.current.rotationAngles.length === EIGHTHS.length}
      onchange={(event) =>
        annotation.updateSettings({
          snap: { rotationAngles: event.currentTarget.checked ? EIGHTHS : QUARTERS },
        })}
    />
    Turns snap every 45°
  </label>
  <p class="hint">Hold Shift to move or turn freely</p>
</div>
