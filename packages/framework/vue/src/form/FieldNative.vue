<!--
  `native` for a control of the app's: the field's picture and the layer's own
  control, at the box's size on screen with the frame's scale undone, so they
  are drawn exactly as they are without a control of the app's. The layer's
  control is embedded here: the app's box around it is the widget's event
  surface and the cursor's way in (`provideEmbeddedControl`).
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
import type { FieldControlPlace, FormColors } from '@embedpdf/web';
import FieldPictures from './FieldPictures.vue';
import type { ShownLook } from './field-looks';
import { nativeControlOf } from './native-control';
import { provideEmbeddedControl } from './widget-box';

const props = defineProps<{
  item: FormWidgetItem;
  colors: FormColors;
  /** Where the box's control and picture go ({@link FieldControlPlace}). */
  place: FieldControlPlace;
  /** The field as it looks now, or `null` while it has nothing to show. */
  look: ShownLook | null;
}>();

provideEmbeddedControl();

/** The box's picture, when it has one, where the box puts it. */
const looks = computed(() => (props.look ? [props.look] : []));
const placeOf = () => props.place.pictureStyle;
</script>

<template>
  <div :style="place.nativeStyle">
    <FieldPictures :looks="looks" :place-of="placeOf" />
    <component :is="nativeControlOf(item)" :item="item" :colors="colors" />
  </div>
</template>
