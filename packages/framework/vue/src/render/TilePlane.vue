<!--
  The sharp plane above the base picture: the plugin's tile plan for this view,
  as keyed <img>s. Each tile reports painted after its first chance to be shown
  (and the inverse when it leaves), so coarser tiles are released only once
  their replacement can really be composited.

  Tiles are placed in view (CSS px) space, never in page points under a scaled
  container: browsers round layout lengths to 1/64 CSS px before transforms
  apply, so a point-space rect under a ×25 zoom would be off by 0.4px or more
  per tile, showing seams. In view space the rounding stays 1/64 px at every zoom.
-->
<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { RenderToken, samePageViewDemand } from '@embedpdf/plugin-render/contract/host';
import type { PageLayerOptions, ViewDemand } from '@embedpdf/plugin-render/contract/host';
import { useOptionalCapability } from '../runtime/capabilities';
import { useKernelValue } from '../runtime/kernel';
import { usePage } from '../runtime/page';
import TileImage from './TileImage.vue';

const props = defineProps<{ layers: PageLayerOptions; fadeMs: number }>();

const page = usePage();
const render = useOptionalCapability(RenderToken);

// This view's tile surface: planned per view and page, so a thumbnail rail's
// demand can't disturb the main view's tiles. The handle is shared per view
// and counted: one `dispose` for every `createViewDemand`.
const view = shallowRef<ViewDemand | null>(null);

// Which page and which view this plane plans for. The page context is a new
// value on every zoom; these change only when the page or the view does, so
// the handle and the page's claim on it follow ownership, never the camera.
const pageRef = computed(() => page.value.ref);
const viewId = computed(() => page.value.view);

// Declared before the handle's own watcher, so on unmount the page is released
// before the handle is disposed. Releasing stops in-flight fetches; resolved
// pictures stay cached.
watch(
  [view, pageRef],
  ([handle, ref], _previous, onCleanup) => {
    if (handle) onCleanup(() => handle.release(ref));
  },
  { immediate: true },
);
watch(
  [render, viewId],
  ([lens, id], _previous, onCleanup) => {
    if (!lens) {
      view.value = null;
      return;
    }
    const handle = lens.createViewDemand(id);
    view.value = handle;
    onCleanup(() => handle.dispose());
  },
  { immediate: true },
);

// The demand: the host's live view (a Stage page's visible part) or the whole
// page. Read on every kernel change, so a pan re-plans; level settling is the
// plugin's.
const demand = useKernelValue(
  () => page.value.getViewDemand?.() ?? { desiredDeviceWidth: page.value.transform.deviceWidth },
  samePageViewDemand,
);

// Demand in, plan out: setting the demand is the one call that fetches and
// re-plans; reading the plan is pure. Before the render, so a camera move
// re-plans in the same update.
watch(
  [view, demand, pageRef, () => props.layers],
  ([handle, wanted, ref, layers]) => {
    handle?.setDemand(ref, wanted, layers);
  },
  { immediate: true },
);
const plan = useKernelValue(() => view.value?.getPlan(pageRef.value) ?? null);

const planeStyle = computed(
  (): CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: `${page.value.transform.contentWidth}px`,
    height: `${page.value.transform.contentHeight}px`,
    pointerEvents: 'none',
    // Tiles carry z ranks (coarse under fine) while generations mix, mid-zoom.
    // A stacking context of its own keeps those ranks inside the plane, below
    // annotations, page chrome and menus.
    isolation: 'isolate',
  }),
);
</script>

<template>
  <div v-if="view && plan && plan.paint.length > 0" :style="planeStyle">
    <component :is="'style'" v-if="fadeMs > 0">
      @keyframes epdf-tile-in { from { opacity: 0 } to { opacity: 1 } }
    </component>
    <TileImage
      v-for="source in plan.paint"
      :key="source.key"
      :source="source"
      :view="view"
      :page="page.ref"
      :view-scale="page.transform.viewScale"
      :fade-ms="fadeMs"
    />
  </div>
</template>
