<!--
  <LinkLayer>: the page's links, as clickable areas. One <a> per link: a click
  or a key follows it through the plugin, which opens websites through the
  opener this binding registers. The layer stands down entirely while the
  active tool doesn't navigate links: the annotation layer owns them then
  (select, move, resize, retarget). The `#link` slot draws a link yourself,
  around the layer's own anchor (`native`).
-->
<script setup lang="ts">
import { computed, h, markRaw, watch } from 'vue';
import type { FunctionalComponent } from 'vue';
import { shallowEqual } from '@embedpdf/core';
import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { LinkToken } from '@embedpdf/plugin-link';
import type { Link } from '@embedpdf/plugin-link';
// The layer paints anchors only while a navigation tool is active: a host fact.
import { LinkToken as LinkHostToken } from '@embedpdf/plugin-link/contract/host';
import { navigableLinksOf } from '@embedpdf/web';
import { useCapability, useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import { useStageToken } from '../stage/scope';
import LinkAnchor from './LinkAnchor.vue';
import { useUriOpener } from './composables';
import type { LinkLayerContext } from './composables';

const slots = defineSlots<{
  /**
   * Draw a link yourself, usually around `native`, the layer's own clickable
   * area: `<component :is="native" />` keeps what a click does. For a link you
   * don't want to change, show `native` alone.
   */
  link?(props: { link: Link; native: FunctionalComponent }): unknown;
}>();

const NO_LINKS: readonly Link[] = Object.freeze([]);

const page = usePage();
const link = useCapability(LinkToken);
// The same capability as a ref, for the watch below: it changes with the document.
const resolved = useOptionalCapability(LinkToken);
useUriOpener();
// A page destination moves the view this page is shown in.
const stage = useOptionalCapability(useStageToken());
// The link plane's own PDF events (enter, exit, down, up, focus, blur): while
// links navigate, their pixels are these anchors, so the events can only come
// from here. One hover pump per layer.
const actions = useOptionalCapability(ActionsToken);
const pump = computed(() => (actions.value ? createHoverPump(actions.value.dispatch) : null));

// The same list until a link on this page changes.
const items = useOptionalSelector(
  LinkToken,
  (lens) => lens.listLinks(page.value.ref),
  NO_LINKS,
  shallowEqual,
);
const engaged = useOptionalSelector(LinkHostToken, (lens) => lens.isNavigationEngaged(), false);
// One owner per pixel: a link attached to an annotation belongs to it while the
// active tool edits annotations, so its anchor stands down (select, move and
// resize work). Links of their own navigate under any navigation tool.
const editEnabled = useOptionalSelector(
  InteractionToken,
  (interaction) => interaction.activeToolEnables('annotation-edit'),
  false,
);

watch(
  [resolved, () => page.value.ref],
  ([lens, pageRef]) => {
    if (lens) void lens.ensureLoaded(pageRef);
  },
  { immediate: true },
);

// An authoring tool is active: the annotation layer owns links, and no anchor
// swallows the pointer.
const visible = computed(() =>
  engaged.value && items.value.length > 0 ? navigableLinksOf(items.value, editEnabled.value) : [],
);

const layer = computed(
  (): LinkLayerContext => ({ link, stage: stage.value, actions: actions.value, pump: pump.value }),
);

// `native` for the `#link` slot: one component per link, kept by its id, that
// draws the link's current anchor. The same component across renders, so a
// zoom moves the anchor instead of replacing it (and its focus).
const visibleById = computed(() => new Map(visible.value.map((item) => [item.id, item])));
const natives = new Map<string, FunctionalComponent>();
function nativeOf(id: string): FunctionalComponent {
  let native = natives.get(id);
  if (!native) {
    native = markRaw(() => {
      const item = visibleById.value.get(id);
      return item ? h(LinkAnchor, { item, layer: layer.value }) : null;
    });
    natives.set(id, native);
  }
  return native;
}
// Forget the anchors of links that are gone.
watch(visibleById, (shown) => {
  for (const id of natives.keys()) if (!shown.has(id)) natives.delete(id);
});
</script>

<template>
  <div v-if="visible.length > 0" :style="{ position: 'absolute', inset: 0, pointerEvents: 'none' }">
    <template v-for="item in visible" :key="item.id">
      <slot v-if="slots.link" name="link" :link="item" :native="nativeOf(item.id)" />
      <LinkAnchor v-else :item="item" :layer="layer" />
    </template>
  </div>
</template>
