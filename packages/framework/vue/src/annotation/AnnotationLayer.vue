<!--
  <AnnotationLayer>: a page's annotations, the selection's outline and
  handles, the tool's preview and the text boxes being typed in. Put it in the
  Stage's #page slot above the rendered page, with the render layer leaving
  annotations out (`<RenderLayer :annotations="false" />`).

  Pure paint: it reads the plugin's per-page render items and chrome and draws
  them. Pointer events reach the plugin through the interaction hub (the
  Stage forwards them), and so does the cursor. Each annotation is one drawing:
  its vector scene, the engine's baked appearance, or a look of yours from
  `renderers`, which may keep the layer's own drawing (`native`) and add to it.
  The `#handle` and `#rotation-handle` slots draw the handles your way.
-->
<script setup lang="ts">
import { computed, h, markRaw, shallowRef, toRaw, watch } from 'vue';
import type { Component } from 'vue';
import { annotationKey, shallowEqual } from '@embedpdf/core';
import type { RenderItem } from '@embedpdf/core-annotation';
import type { Annotation, TextItem } from '@embedpdf/plugin-annotation';
// The layer is framework code, so it resolves the full host lens (page items,
// chrome, appearances…): the same runtime token as the public one, typed wider.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import {
  annotationDrawingOf,
  bakedAppearanceOf,
  editingTextKeyOf,
  layerTextBoxesOf,
  loadAppearanceUrls,
  registerRendererBehaviors,
} from '@embedpdf/web';
import type { AnnotationDrawing, AppearanceUrl } from '@embedpdf/web';
import { devWarn } from '../dev';
import { usePageLayerFact } from '../dev-registry';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import AnnotationChrome from './AnnotationChrome.vue';
import AnnotationFrame from './AnnotationFrame.vue';
import AnnotationLook from './AnnotationLook.vue';
import FreeTextBox from './FreeTextBox.vue';
import NativeDrawing from './NativeDrawing.vue';
import StampGhost from './StampGhost.vue';
import type { AnnotationRenderer, HandleProps, RotationHandleProps } from './types';

const props = defineProps<{
  /**
   * Your own look for some annotations: each renderer says which ones (`for`)
   * and with which component. Define the list once, in `<script setup>`.
   */
  renderers?: AnnotationRenderer[];
}>();

const slots = defineSlots<{
  /** Draw each handle yourself, in place of the layer's: it gets {@link HandleProps}. */
  handle?(props: HandleProps): unknown;
  /** Draw the rotation handle yourself: it gets {@link RotationHandleProps}. */
  'rotation-handle'?(props: RotationHandleProps): unknown;
}>();

type Drawing = AnnotationDrawing<AnnotationRenderer>;

const NO_ITEMS: readonly RenderItem[] = Object.freeze([]);
const NO_TEXTS: readonly TextItem[] = Object.freeze([]);

const page = usePage();
const annotation = useOptionalCapability(AnnotationHostToken);
const interaction = useOptionalCapability(InteractionToken);
// The active tool decides which interactive renderers take the pointer, so a
// tool change draws the layer again (`interactive` functions read it live).
const activeToolId = useOptionalSelector(
  InteractionToken,
  (hub) => hub.getActiveToolId() as string,
  '',
);

// The page's view (its zoom and turn) projects annotations that keep their
// size or stay upright on screen (`noZoom`, `noRotate`) inside the plugin: no
// flag logic lives here. `zoom`, not `viewScale`: 1 is the page's 100%.
const items = useOptionalSelector(
  AnnotationHostToken,
  (host) => {
    const { transform, ref } = page.value;
    return host.listPageItems(ref, { zoom: transform.zoom, rotation: transform.rotation });
  },
  NO_ITEMS,
  shallowEqual,
);
const texts = useOptionalSelector(
  AnnotationHostToken,
  (host) => {
    const { transform, ref } = page.value;
    return host.listTextItems(ref, { zoom: transform.zoom, rotation: transform.rotation });
  },
  NO_TEXTS,
  shallowEqual,
);

// ── your renderers ───────────────────────────────────────────────────────────

usePageLayerFact(page, 'annotationRenderers', () => props.renderers ?? null);

/** Bumped when the renderers' behaviors register again, so the drawings are read again. */
const registrations = shallowRef(0);
// An `interactive` renderer takes the pointer through a behavior the plugin
// knows, registered once per capability and entry however many pages mount
// the layer. Entry identity is the key, so a list written inline in the
// template (a new array on every render) registers again each time: say so.
watch(
  [annotation, () => props.renderers],
  ([host, renderers], previous, onCleanup) => {
    const before = previous?.[1];
    if (renderers && before && renderers !== before && shallowEqual(renderers, before)) {
      devWarn(
        'annotation-renderers-inline',
        '<AnnotationLayer :renderers> was given a new array with the same entries — define it ' +
          'once in <script setup>, because entry identity keys the behavior registration.',
      );
    }
    if (host && renderers) {
      onCleanup(
        registerRendererBehaviors(host, renderers, () =>
          String(interaction.value?.getActiveToolId() ?? ''),
        ),
      );
    }
    registrations.value += 1;
  },
  { immediate: true },
);

// ── baked appearances ────────────────────────────────────────────────────────

const urls = shallowRef<Record<string, AppearanceUrl>>({});
// Baked annotations draw from engine rasters: load them again when the page's
// baked set or an appearance version changes (a stamp just placed, a resize
// whose new appearance arrived), and when the bake scale does. A move or a
// turn leaves the epoch as it is (the same pixels, placed elsewhere), and live
// gestures don't touch it: nothing loads mid-drag.
const bakedKey = useOptionalSelector(
  AnnotationHostToken,
  (host) => host.getAppearanceEpoch(page.value.ref),
  '',
);
// The bake scale follows the document's render policy: zoom steps inside one
// rung of the appearance lattice bake nothing again.
const bakeScale = useOptionalSelector(
  AnnotationHostToken,
  (host) => host.getBakeScale(page.value.transform.renderScale),
  0,
);
watch(
  [annotation, () => page.value.ref, bakeScale, bakedKey],
  ([host, pageRef, scale], _previous, onCleanup) => {
    if (!host || !scale) return;
    onCleanup(
      loadAppearanceUrls(
        (signal) => host.renderAppearances(pageRef, scale, signal),
        annotationKey,
        (loaded) => (urls.value = loaded),
      ),
    );
  },
  { immediate: true },
);

// ── what each annotation draws ───────────────────────────────────────────────

/** The text box being typed in, by key: while it is, a look's editor takes the keys. */
const editingKey = computed(() => editingTextKeyOf(texts.value, annotationKey));

interface Drawn {
  item: RenderItem;
  annotation: Annotation | null;
  drawing: Drawing;
}

/** The layer's own drawing, for what isn't an annotation yet (a drawing in progress, a ghost). */
const NATIVE: Drawing = { kind: 'native', inert: false };

// Ownership beats looks: an engaged behavior's renderer is authoritative (the
// form plugin's controls own their DOM); `for` rules apply only to what the
// layer owns, and draw without the pointer. Read whenever the items, the
// active tool or the registrations change: `interactive` functions and the
// plugin's behaviors are asked here.
const drawn = computed((): Drawn[] => {
  void activeToolId.value;
  void registrations.value;
  const host = annotation.value;
  const renderers = props.renderers;
  return items.value.map((item): Drawn => {
    const record = item.annotation ?? null;
    if (!record || !host) return { item, annotation: null, drawing: NATIVE };
    const typing = editingKey.value !== null && annotationKey(record.ref) === editingKey.value;
    return { item, annotation: record, drawing: annotationDrawingOf(record, host, renderers, typing) };
  });
});

/** The text boxes the layer draws itself: one your renderer draws is edited there (`useRichTextEditor()`). */
const ownTexts = computed(() =>
  layerTextBoxesOf(texts.value, items.value, props.renderers, annotationKey),
);

// `native` for a renderer: one component per annotation, kept by its id, that
// draws the layer's current drawing of it. The same component across renders,
// so a drag moves the drawing instead of replacing it.
const itemsById = computed(() => new Map(items.value.map((item) => [item.id, item])));
const natives = new Map<string, Component>();
const framedNatives = new Map<string, Component>();
function nativeOf(id: string): Component {
  let native = natives.get(id);
  if (!native) {
    native = markRaw(() => {
      const item = itemsById.value.get(id);
      return item ? h(NativeDrawing, { item, url: urls.value[id]?.url ?? null }) : null;
    });
    natives.set(id, native);
  }
  return native;
}
/** The native drawing in its frame: what a sibling plugin's renderer keeps where the layer draws it. */
function framedNativeOf(id: string): Component {
  let native = framedNatives.get(id);
  if (!native) {
    native = markRaw(() => {
      const item = itemsById.value.get(id);
      return item
        ? h(AnnotationFrame, { item, page: page.value }, () => h(nativeOf(id)))
        : null;
    });
    framedNatives.set(id, native);
  }
  return native;
}
// Forget the drawings of annotations that are gone.
watch(itemsById, (shown) => {
  for (const id of natives.keys()) if (!shown.has(id)) natives.delete(id);
  for (const id of framedNatives.keys()) if (!shown.has(id)) framedNatives.delete(id);
});

/** A renderer's component, never a reactive proxy of it (a list kept in a `ref`). */
const componentOf = (component: Component): Component => toRaw(component);
</script>

<template>
  <div :style="{ position: 'absolute', inset: 0, pointerEvents: 'none' }">
    <template v-for="{ item, annotation: record, drawing } in drawn" :key="item.id">
      <component
        :is="componentOf(drawing.entry.component)"
        v-if="drawing.kind === 'owned' && record"
        :annotation="record"
        :item="item"
        :page="page"
        :native="framedNativeOf(item.id)"
        :hovered="item.hovered ?? false"
        :selected="item.selected"
        :interactive="true"
      />
      <AnnotationFrame
        v-else-if="drawing.kind === 'look' && record"
        :item="item"
        :page="page"
        :interactive="drawing.interactive"
        :inert="drawing.inert"
      >
        <AnnotationLook
          :component="componentOf(drawing.entry.component)"
          :scaled="drawing.entry.scale !== false"
          :annotation="record"
          :item="item"
          :page="page"
          :native="nativeOf(item.id)"
          :appearance="bakedAppearanceOf(urls, item.id)"
          :interactive="drawing.interactive"
        />
      </AnnotationFrame>
      <!-- Inert when an engaged behavior has no renderer of yours: its plugin
           owns the input (a link's anchor takes the click), and the annotation
           keeps its own look. -->
      <AnnotationFrame
        v-else
        :item="item"
        :page="page"
        :inert="drawing.kind === 'native' && drawing.inert"
      >
        <NativeDrawing :item="item" :url="urls[item.id]?.url ?? null" />
      </AnnotationFrame>
    </template>
    <FreeTextBox v-for="text in ownTexts" :key="text.id" :item="text" :page="page" />
    <StampGhost :page="page" />
    <AnnotationChrome :page="page">
      <template v-if="slots.handle" #handle="handle">
        <slot name="handle" v-bind="handle" />
      </template>
      <template v-if="slots['rotation-handle']" #rotation-handle="handle">
        <slot name="rotation-handle" v-bind="handle" />
      </template>
    </AnnotationChrome>
  </div>
</template>
