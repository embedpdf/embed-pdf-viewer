<!--
  <Toolbar>: measures what fits and makes room, and you draw every part.

    1. A hidden measurement layer renders every unit in every variant (and the
       folded groups and the "More" button), each watched with `observeWidth`
       from @embedpdf/web, so a new language, a font loading, browser zoom and
       your CSS all re-measure on their own (`createToolbarWidths`).
    2. core-ui's `solve()` gives each unit a variant, a folded group or the
       "More" menu (`layoutToolbar` turns that into parts).
    3. The live row draws the parts; the "More" menu is derived from what
       didn't fit (`projectOverflow`), never written by hand.

  Every part is a slot with a plain default: `#command`, `#custom`,
  `#collapsed`, `#group-trigger`, `#separator`, `#overflow-trigger` and
  `#overflow-menu`. The defaults' colors come from the `--epdf-toolbar-*` CSS
  variables only.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { layoutToolbar, normalizeBar } from '@embedpdf/core-ui';
import type { BarSchema, LiveSection } from '@embedpdf/core-ui';
// The "More" menu asks which menu a command opens, a host fact, so the host lens is bound here.
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import { unregisteredCommand } from '@embedpdf/plugin-commands/contract';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import { createToolbarWidths, observeContentWidth, toolbarMeasureKey } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import { useDocumentId, useViewerBinding } from '../runtime/kernel';
import DefaultOverflowMenu from './DefaultOverflowMenu.vue';
import DefaultOverflowTrigger from './DefaultOverflowTrigger.vue';
import Measured from './Measured.vue';
import ToolbarPart from './ToolbarPart.vue';
import type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './views';

const props = withDefaults(
  defineProps<{
    /** What goes in the toolbar: its sections, groups and items. */
    bar: BarSchema;
    /** Px between adjacent items (the CSS flex gap; the fit budgets the same number). */
    gap?: number;
    /** The width of the separator your `#separator` slot draws. */
    separatorWidth?: number;
  }>(),
  { gap: 8, separatorWidth: 1 },
);

defineSlots<{
  /** A command's button at a variant. Default: a plain `<button>` with the command's label. */
  command?(props: { command: ResolvedCommand; variant: string; run: () => void }): unknown;
  /**
   * Your own items, by `name` (from `custom(name, command)`). An item it draws
   * nothing for is its command's button. Without this slot, each item is a
   * native `<slot :name>` element with the command's button inside, for a
   * custom element's children to fill.
   */
  custom?(props: {
    name: string;
    variant: string;
    /** `'live'` in the visible row, `'measure'` in the hidden measurement layer. */
    layer: 'live' | 'measure';
    /** Report the item's width yourself, for content the measurement layer can't hold. */
    measure: (width: number) => void;
  }): unknown;
  /** A folded group: its button and its menu. Default: a `<select>` for `'select'`, a menu button for `'menu'`. */
  collapsed?(props: { view: CollapsedGroupView }): unknown;
  /** The button of a group that shed items, and its menu. Default: a chevron opening a menu. */
  'group-trigger'?(props: { view: GroupDisclosureView }): unknown;
  /** The line between groups. Default: a 1px line. */
  separator?(): unknown;
  /** The "More" button. Default: a plain ⋯ button. */
  'overflow-trigger'?(props: { isOpen: boolean; toggle: () => void }): unknown;
  /** The "More" menu, with its sections, rows and the call that runs each one. Default: a minimal popover. */
  'overflow-menu'?(props: { view: OverflowMenuView }): unknown;
}>();

const { track } = useViewerBinding();
const commands = useCapability(CommandsToken);
const documentId = useDocumentId();

// ── measuring ──────────────────────────────────────────────────────────────

const container = ref<HTMLDivElement | null>(null);
const containerWidth = ref(0);
watch(
  container,
  (element, _previous, onCleanup) => {
    if (element) {
      onCleanup(observeContentWidth(element, (width) => (containerWidth.value = width)));
    }
  },
  { immediate: true, flush: 'post' },
);

// A width that changed by more than half a pixel fits (and draws) again.
const widths = createToolbarWidths();
const measured = ref(0);
function onWidth(key: string, width: number) {
  if (widths.report(key, width)) measured.value += 1;
}

// ── the fit ──────────────────────────────────────────────────────────────────

const normalized = computed(() => normalizeBar(props.bar));

const resolve = (id: string): ResolvedCommand | null =>
  commands.resolveCommand(id, documentId.value ?? undefined);
const execute = (id: string): void =>
  void commands.execute(id, { documentId: documentId.value ?? undefined });

// Command state is derived on read, so this runs again on every kernel change: labels, `active`
// and `visible` (and with them the measurement layer) stay live. A toolbar is a few dozen items,
// so drawing it again on each change is the simple, correct baseline.
const layout = computed(() => {
  track();
  void measured.value;
  return layoutToolbar({
    bar: normalized.value,
    resolve,
    unregistered: unregisteredCommand,
    execute,
    menuTarget: (id) => commands.getMenuTarget(id),
    metrics: widths.metrics(props.gap, props.separatorWidth),
    measureKey: toolbarMeasureKey,
    containerWidth: containerWidth.value,
  });
});

// ── the "More" menu ─────────────────────────────────────────────────────────

const overflowOpen = ref(false);
const toggleOverflow = () => (overflowOpen.value = !overflowOpen.value);
const noop = () => {};
watch(
  () => layout.value.hasOverflow,
  (hasOverflow) => {
    if (!hasOverflow) overflowOpen.value = false;
  },
);

const overflowView = computed(
  (): OverflowMenuView => ({
    sections: layout.value.overflow,
    isOpen: overflowOpen.value,
    close: () => (overflowOpen.value = false),
    resolve,
    execute,
  }),
);

// ── layout ───────────────────────────────────────────────────────────────────

/**
 * The center section carries auto margins: it centers in the space the other
 * two leave, and gives way before anything overlaps. The row itself has no
 * gap, so what the fit says fits, fits. Sections never grow or shrink: fitting
 * is the solver's job, not flexbox's.
 */
const sectionStyle = (name: LiveSection['name']) => ({
  display: 'flex',
  alignItems: 'center',
  gap: `${props.gap}px`,
  flex: '0 0 auto',
  ...(name === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : null),
});

const MEASURE_LAYER = {
  position: 'absolute',
  left: 0,
  top: 0,
  height: 0,
  overflow: 'hidden',
  visibility: 'hidden',
  pointerEvents: 'none',
  display: 'flex',
  whiteSpace: 'nowrap',
} as const;
</script>

<template>
  <div ref="container" :style="{ position: 'relative', display: 'flex', alignItems: 'center' }">
    <div v-for="section in layout.sections" :key="section.name" :style="sectionStyle(section.name)">
      <template v-for="(group, index) in section.groups" :key="group.id">
        <slot v-if="index > 0" name="separator">
          <span
            :style="{ width: '1px', alignSelf: 'stretch', background: 'currentColor', opacity: 0.2 }"
          />
        </slot>
        <ToolbarPart
          v-for="part in group.parts"
          :key="part.key"
          :part="part"
          layer="live"
          @width="onWidth"
        >
          <template v-if="$slots.command" #command="scope">
            <slot name="command" v-bind="scope" />
          </template>
          <template v-if="$slots.custom" #custom="scope">
            <slot name="custom" v-bind="scope" />
          </template>
          <template v-if="$slots.collapsed" #collapsed="scope">
            <slot name="collapsed" v-bind="scope" />
          </template>
          <template v-if="$slots['group-trigger']" #group-trigger="scope">
            <slot name="group-trigger" v-bind="scope" />
          </template>
        </ToolbarPart>
      </template>
      <span
        v-if="section.name === 'end' && layout.hasOverflow"
        :style="{ position: 'relative', display: 'inline-flex' }"
      >
        <slot name="overflow-trigger" :is-open="overflowOpen" :toggle="toggleOverflow">
          <DefaultOverflowTrigger :is-open="overflowOpen" @toggle="toggleOverflow" />
        </slot>
        <slot name="overflow-menu" :view="overflowView">
          <DefaultOverflowMenu :view="overflowView" />
        </slot>
      </span>
    </div>

    <!-- The measurement layer: hidden, inert and observed. Text reflow (a language, a font,
         browser zoom) fires the observers; no code handles it. -->
    <div aria-hidden="true" :style="MEASURE_LAYER">
      <template v-for="part in layout.measured" :key="part.measureKey">
        <!-- A custom item without a #custom slot is a socket, measured where it renders: a second
             <slot> of its name here would take the projected children from the row. -->
        <Measured
          v-if="part.kind !== 'custom' || $slots.custom"
          :measure-key="part.measureKey"
          @width="onWidth"
        >
          <ToolbarPart :part="part" layer="measure" @width="onWidth">
            <template v-if="$slots.command" #command="scope">
              <slot name="command" v-bind="scope" />
            </template>
            <template v-if="$slots.custom" #custom="scope">
              <slot name="custom" v-bind="scope" />
            </template>
            <template v-if="$slots.collapsed" #collapsed="scope">
              <slot name="collapsed" v-bind="scope" />
            </template>
            <template v-if="$slots['group-trigger']" #group-trigger="scope">
              <slot name="group-trigger" v-bind="scope" />
            </template>
          </ToolbarPart>
        </Measured>
      </template>
      <Measured :measure-key="toolbarMeasureKey.overflowTrigger" @width="onWidth">
        <slot name="overflow-trigger" :is-open="false" :toggle="noop">
          <DefaultOverflowTrigger :is-open="false" />
        </slot>
      </Measured>
    </div>
  </div>
</template>
