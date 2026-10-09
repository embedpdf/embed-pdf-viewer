<script setup lang="ts">
import { useAnnotation, useAnnotationSettings } from '@embedpdf/vue/annotation';

const QUARTERS = [0, 90, 180, 270];
const EIGHTHS = [0, 45, 90, 135, 180, 225, 270, 315];

const annotation = useAnnotation();
const snap = useAnnotationSettings((settings) => settings.snap);

const checked = (event: Event) => (event.target as HTMLInputElement).checked;
</script>

<template>
  <div class="toolbar">
    <label class="check">
      <input
        type="checkbox"
        :checked="snap.alignment"
        @change="annotation.updateSettings({ snap: { alignment: checked($event) } })"
      />
      Snap to other annotations
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="snap.rotationAngles.length === EIGHTHS.length"
        @change="
          annotation.updateSettings({
            snap: { rotationAngles: checked($event) ? EIGHTHS : QUARTERS },
          })
        "
      />
      Turns snap every 45°
    </label>
    <p class="hint">Hold Shift to move or turn freely</p>
  </div>
</template>
