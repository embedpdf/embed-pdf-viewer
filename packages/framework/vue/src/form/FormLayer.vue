<!--
  <FormLayer>: the form's fields on one page, as real HTML controls people fill
  in, with or without the annotation plugin. The field's own picture (the
  engine's drawing of its value, borders and fonts) is drawn below it, by the
  <RenderLayer> raster or by the <AnnotationLayer> while the form plugin keeps
  widgets inert for filling. The controls add what people interact with:

    text   → the picture at rest; focus shows an editor in the field's font.
    toggle → the picture is the control; a click writes the toggled value.
    combo  → an invisible native <select> over the picture.
    list   → a visible native <select>: one surface owns the rows, the
             keyboard and the scrolling.
    button → a native click target over the picture that runs its action.
    signature → "sign here", or the signed field's details, with the
             signature plugin.

  It shows while the active tool fills forms (the `pointer` and `pan` tools
  do), and stands down in design mode, where fields are boxes you select and
  move. What the viewer draws itself (the focus ring, the edge of a field
  without a border, the editor) takes its colors from the form settings, which
  the `--epdf-form-*` CSS variables override. The colors, the field looks, the
  boxes' and controls' styles, and the toggle, text-field and list-box
  policies are `@embedpdf/web`'s, the same for every framework.
-->
<script setup lang="ts">
import { watch } from 'vue';
import { shallowEqual } from '@embedpdf/core';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// Loading a page's widgets and listing them as controls are host reads.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import ButtonControl from './ButtonControl.vue';
import ComboControl from './ComboControl.vue';
import ListControl from './ListControl.vue';
import SignatureControl from './SignatureControl.vue';
import TextControl from './TextControl.vue';
import ToggleControl from './ToggleControl.vue';
import { useFormColors } from './composables';

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

const page = usePage();
const form = useOptionalCapability(FormHostToken);
const colors = useFormColors();
const active = useOptionalSelector(
  InteractionToken,
  (interaction) => interaction.activeToolEnables('form-fill'),
  false,
);
// The same list until a widget on this page changes.
const items = useOptionalSelector(
  FormHostToken,
  (lens) => lens.listWidgets(page.value.ref),
  NO_WIDGETS,
  shallowEqual,
);

// The page's widgets are read the first time the layer shows on it.
watch(
  [form, active, () => page.value.ref],
  ([lens, shown, pageRef]) => {
    if (lens && shown) void lens.ensureLoaded(pageRef);
  },
  { immediate: true },
);

/** One control per widget of a field: a radio group has a widget per button. */
const keyOf = (item: FormWidgetItem) => `${item.key}:${item.annotObjectNumber}`;
</script>

<template>
  <div v-if="active" :style="{ position: 'absolute', inset: '0', pointerEvents: 'none' }">
    <template v-for="item in items" :key="keyOf(item)">
      <TextControl v-if="item.control === 'text'" :item="item" :colors="colors" />
      <ToggleControl v-else-if="item.control === 'toggle'" :item="item" :colors="colors" />
      <ListControl
        v-else-if="item.control === 'choice' && item.kind === 'list'"
        :item="item"
        :colors="colors"
      />
      <ComboControl v-else-if="item.control === 'choice'" :item="item" :colors="colors" />
      <ButtonControl v-else-if="item.control === 'button'" :item="item" :colors="colors" />
      <SignatureControl v-else-if="item.control === 'signature'" :item="item" :colors="colors" />
    </template>
  </div>
</template>
