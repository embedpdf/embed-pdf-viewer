<!--
  <PagePointerSource>: the one pointer listener of a page. It converts pointer
  events to page space through the page context and hands them to the
  interaction hub, so it works the same on any page surface. Features never
  listen to the pointer themselves: they register handlers with the hub, and a
  tool of your own brings its pointer methods (`registerTool`). It sits on top
  as the page's event surface; the layers below ignore the pointer.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { attachPagePointer } from '@embedpdf/web';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';

const page = usePage();
// The pointer source is a host of the hub: it dispatches samples.
const interaction = useOptionalCapability(InteractionToken);
const cursor = useOptionalSelector(InteractionToken, (hub) => hub.getCursor(), 'default');
const element = ref<HTMLDivElement | null>(null);

// The listener is `@embedpdf/web`'s, shared with every framework. It reads the
// page when an event arrives: a zoom changes it, and a drag carries on through it.
watch(
  [element, interaction],
  ([surface, hub], _previous, onCleanup) => {
    if (!surface || !hub) return;
    onCleanup(attachPagePointer(surface, hub, () => page.value));
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <div ref="element" :style="{ position: 'absolute', inset: 0, cursor, touchAction: 'none' }" />
</template>
