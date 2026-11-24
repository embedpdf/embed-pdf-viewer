<!--
  <FormLayer>: the form's fields on one page, painted as the engine draws them
  (their values, borders and fonts), with real HTML controls people fill them
  in with, with or without the annotation plugin. While it's on the page, the
  <RenderLayer> leaves the fields out of the page's picture. The controls add
  what people interact with on top of the pictures:

    text   → the picture at rest; focus shows an editor in the field's font.
    toggle → the picture is the control; a click writes the toggled value.
    combo  → an invisible native <select> over the picture.
    list   → a visible native <select>: one surface owns the rows, the
             keyboard and the scrolling.
    button → a native click target over the picture that runs its action.
    signature → "sign here", or the signed field's details, with the
             signature plugin.

  The controls show while the active tool fills forms (the `pointer` and `pan`
  tools do), and stand down in design mode, where fields are boxes you select
  and move. What the viewer draws itself (the focus ring, the edge of a field
  without a border, the editor) takes its colors from the form settings, which
  the `--epdf-form-*` CSS variables override. The colors, the field looks, the
  boxes' and controls' styles, and the toggle, text-field and list-box
  policies are `@embedpdf/web`'s, the same for every framework.

  `controls` draws some boxes with components of yours (`FieldControl`), which
  show and stand down with the layer's own; UI attached to a box uses
  `useFormWidgetAnchor()` and `<Anchored>`.
-->
<script setup lang="ts">
import { computed, h, watch } from 'vue';
import type { CSSProperties, FunctionalComponent } from 'vue';
import { annotationKey, shallowEqual } from '@embedpdf/core';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// Loading a page's widgets and listing them as controls are host reads.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { fieldControlFor } from '@embedpdf/web';
import { usePaintsPagePart } from '../page-layers';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import CustomControl from './CustomControl.vue';
import FieldPictures from './FieldPictures.vue';
import { useFormColors } from './composables';
import { useFieldLooks } from './field-looks';
import type { ShownLook } from './field-looks';
import { nativeControlOf } from './native-control';
import type { FieldControl } from './types';

const props = defineProps<{
  /** Your own control for some boxes ({@link FieldControl}). */
  controls?: readonly FieldControl[];
}>();

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

const page = usePage();
const form = useOptionalCapability(FormHostToken);
// While it's here with the form plugin, the page's picture leaves the fields to it.
usePaintsPagePart(
  computed(() => (form.value ? page.value.ref : null)),
  'formFields',
);
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

// The page's widgets are read when the layer comes to it.
watch(
  [form, () => page.value.ref],
  ([lens, pageRef]) => {
    if (lens) void lens.ensureLoaded(pageRef);
  },
  { immediate: true },
);

/** One control per widget of a field: a radio group has a widget per button. */
const keyOf = (item: FormWidgetItem) => `${item.key}:${item.annotObjectNumber}`;

// The controls show while the active tool fills forms, yours with the layer's own.
const shown = computed(() => (active.value ? items.value : NO_WIDGETS));
/** The boxes a control of yours draws, each with its control. */
const custom = computed(() => {
  const drawn = new Map<FormWidgetItem, FieldControl>();
  if (!props.controls?.length) return drawn;
  for (const item of shown.value) {
    const control = fieldControlFor(item, props.controls);
    if (control) drawn.set(item, control);
  }
  return drawn;
});

const looks = useFieldLooks();
const lookOf = computed(() => new Map(looks.value.map((look) => [look.key, look])));
/** The pictures the layer draws itself: a box a control of yours draws has its picture in `native`. */
const pictures = computed(() => {
  if (custom.value.size === 0) return looks.value;
  const theirs = new Set([...custom.value.keys()].map((item) => annotationKey(item.ref)));
  return looks.value.filter((look) => !theirs.has(look.key));
});
/** A picture in the page layer: where its widget stands. */
const placeOf = ({ frame }: ShownLook): CSSProperties => ({
  position: 'absolute',
  left: `${frame.left}px`,
  top: `${frame.top}px`,
  width: `${frame.width}px`,
  height: `${frame.height}px`,
});
/**
 * The layer's pictures draw in a component of their own: a picture that
 * changes draws the pictures again, and leaves the layer's controls alone.
 */
const Pictures: FunctionalComponent = () => h(FieldPictures, { looks: pictures.value, placeOf });
</script>

<template>
  <div :style="{ position: 'absolute', inset: '0', pointerEvents: 'none' }">
    <Pictures />
    <template v-for="item in shown" :key="keyOf(item)">
      <CustomControl
        v-if="custom.has(item)"
        :item="item"
        :control="custom.get(item)!"
        :colors="colors"
        :look="lookOf.get(annotationKey(item.ref)) ?? null"
      />
      <component :is="nativeControlOf(item)" v-else :item="item" :colors="colors" />
    </template>
  </div>
</template>
