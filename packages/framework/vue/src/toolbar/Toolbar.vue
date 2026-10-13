<!--
  <Toolbar>: measures what fits and makes room, and you draw every part.

    1. A hidden measurement layer renders every unit in every variant (and the
       folded groups and the "More" button), each watched with `observeLength`
       from @embedpdf/web along the toolbar (widths, or heights when it is
       vertical), so a new language, a font loading, browser zoom and your CSS
       all re-measure on their own (`createToolbarLengths`).
    2. core-ui's `solve()` gives each unit a variant, a folded group or the
       "More" menu (`layoutToolbar` turns that into parts).
    3. The live row draws the parts; the "More" menu is derived from what
       didn't fit (`projectOverflow`), never written by hand.

  The toolbar is one tab stop with arrow keys along it (`attachToolbarFocus`),
  and its default menus take the menu keys (`attachMenuKeys`). Every part is a
  slot with a plain default: `#command`, `#custom`, `#collapsed`,
  `#group-trigger`, `#separator`, `#overflow-trigger` and `#overflow-menu`. The
  defaults' colors come from the `--epdf-toolbar-*` CSS variables only.
-->
<script setup lang="ts">
import { Comment, Fragment, computed, isVNode, onUpdated, ref, watch } from 'vue';
import { layoutToolbar, normalizeBar } from '@embedpdf/core-ui';
import type { BarSchema, LiveSection } from '@embedpdf/core-ui';
// The "More" menu asks which menu a command opens, a host fact, so the host lens is bound here.
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import { unregisteredCommand } from '@embedpdf/plugin-commands/contract';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import {
  TOOLBAR_ITEM_ATTRIBUTE,
  attachToolbarFocus,
  createToolbarLengths,
  observeContentLength,
  toolbarMeasureKey,
} from '@embedpdf/web';
import type { RovingFocus } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import { useDocumentId, useViewerBinding } from '../runtime/kernel';
import DefaultOverflowMenu from './DefaultOverflowMenu.vue';
import DefaultOverflowTrigger from './DefaultOverflowTrigger.vue';
import Measured from './Measured.vue';
import ToolbarPart from './ToolbarPart.vue';
import type {
  CollapsedGroupView,
  GroupDisclosureView,
  OverflowMenuView,
  ToolbarPart as Part,
} from './views';

const props = withDefaults(
  defineProps<{
    /** What goes in the toolbar: its sections, groups and items. */
    bar: BarSchema;
    /**
     * Which way the toolbar runs. A vertical toolbar fits the height it's
     * given, so give it one; it stacks its sections top, middle and bottom, and
     * draws every command at `'icon'`, with the label for a tooltip.
     */
    orientation?: 'horizontal' | 'vertical';
    /** Px between adjacent items (the CSS flex gap; the fit budgets the same number). */
    gap?: number;
    /**
     * The thickness of the separator your `#separator` slot draws: its width
     * across a horizontal toolbar, its height in a vertical one.
     */
    separatorWidth?: number;
    /** The toolbar's name for screen readers, for a page with more than one toolbar. */
    'aria-label'?: string;
  }>(),
  { orientation: 'horizontal', gap: 8, separatorWidth: 1 },
);

const slots = defineSlots<{
  /** A command's button at a variant. Default: a plain `<button>` with the command's label. */
  command?(props: { command: ResolvedCommand; variant: string; run: () => void }): unknown;
  /**
   * Your own items, by `name` (from `custom(name, command)`). An item it draws
   * nothing for is its command's button. Without this slot, each item is a
   * native `<slot :name>` element with the command's button inside, for a
   * custom element's children to fill. The first element of an item that
   * takes focus is the item's stop in the toolbar's arrow-key order.
   */
  custom?(props: {
    name: string;
    variant: string;
    /** `'live'` in the visible row, `'measure'` in the hidden measurement layer. */
    layer: 'live' | 'measure';
    /**
     * Report the item's length yourself (its width, or its height in a
     * vertical toolbar), for content the measurement layer can't hold. An
     * item the slot draws nothing for in the `'measure'` layer, but draws in
     * the `'live'` one, is measured only this way, where it renders.
     */
    measure: (length: number) => void;
  }): unknown;
  /** A folded group: its button and its menu. Default: a `<select>` for `'select'`, a menu button for `'menu'`. */
  collapsed?(props: { view: CollapsedGroupView }): unknown;
  /** The button of a group that shed items, and its menu. Default: a chevron opening a menu. */
  'group-trigger'?(props: { view: GroupDisclosureView }): unknown;
  /** The line between groups. Default: a 1px line across the toolbar. */
  separator?(): unknown;
  /** The "More" button. Default: a plain ⋯ button. */
  'overflow-trigger'?(props: { isOpen: boolean; toggle: () => void }): unknown;
  /** The "More" menu, with its sections, rows and the call that runs each one. Default: a minimal popover. */
  'overflow-menu'?(props: { view: OverflowMenuView }): unknown;
}>();

const { track } = useViewerBinding();
const commands = useCapability(CommandsToken);
const documentId = useDocumentId();
const vertical = computed(() => props.orientation === 'vertical');
// `aria-label` is declared by its HTML name, the one templates type-check (vue-tsc keeps `aria-*`
// names as written), and Vue hands it over camel-cased, as `ariaLabel`.
const ariaLabel = computed(
  () => (props as Readonly<Record<string, unknown>>).ariaLabel as string | undefined,
);

// ── measuring ──────────────────────────────────────────────────────────────

const container = ref<HTMLDivElement | null>(null);
const containerLength = ref(0);
watch(
  [container, () => props.orientation],
  ([element, orientation], _previous, onCleanup) => {
    if (element) {
      onCleanup(
        observeContentLength(element, orientation, (length) => (containerLength.value = length)),
      );
    }
  },
  { immediate: true, flush: 'post' },
);

// A length that changed by more than half a pixel fits (and draws) again.
const lengths = createToolbarLengths();
const measured = ref(0);
function onLength(key: string, length: number) {
  if (lengths.report(props.orientation, key, length)) measured.value += 1;
}

// ── the keyboard ─────────────────────────────────────────────────────────────

// One tab stop, and arrow keys along the toolbar.
let roving: RovingFocus | null = null;
watch(
  [container, () => props.orientation],
  ([element, orientation], _previous, onCleanup) => {
    if (!element) return;
    const focus = attachToolbarFocus(element, orientation);
    roving = focus;
    onCleanup(() => {
      focus.detach();
      roving = null;
    });
  },
  { immediate: true, flush: 'post' },
);
// Any draw can add, remove or disable an item, so the tab stop is checked after each one.
onUpdated(() => roving?.refresh());

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
    metrics: lengths.metrics(props.orientation, props.gap, props.separatorWidth),
    measureKey: toolbarMeasureKey,
    containerLength: containerLength.value,
    orientation: props.orientation,
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
 * The sections run along the toolbar. The center one carries auto margins: it
 * centers in the space the other two leave, and gives way before anything
 * overlaps. The toolbar itself has no gap, so what the fit says fits, fits.
 * Sections never grow or shrink: fitting is the solver's job, not flexbox's.
 */
const sectionStyle = (name: LiveSection['name']) => ({
  display: 'flex',
  flexDirection: vertical.value ? ('column' as const) : ('row' as const),
  alignItems: 'center',
  gap: `${props.gap}px`,
  flex: '0 0 auto',
  ...(name !== 'center'
    ? null
    : vertical.value
      ? { marginTop: 'auto', marginBottom: 'auto' }
      : { marginLeft: 'auto', marginRight: 'auto' }),
});

/** The default separator: a 1px line across the toolbar, upright in a horizontal one, flat in a vertical one. */
const separatorStyle = computed(() => ({
  ...(vertical.value ? { height: '1px' } : { width: '1px' }),
  alignSelf: 'stretch',
  background: 'currentColor',
  opacity: 0.2,
}));

/** Marks the element around each item of the live row: its first focusable element is a stop. */
const TOOLBAR_ITEM = { [TOOLBAR_ITEM_ATTRIBUTE]: '' };

/** The element around an item adds no box, so the item lays out as the section's own child. */
const ITEM_STYLE = { display: 'contents' } as const;

/** Whether slot content draws anything: more than comments (a false `v-if`) and empty fragments. */
function draws(content: unknown): boolean {
  return (Array.isArray(content) ? content : [content]).some((node: unknown) => {
    if (node === null || node === undefined || typeof node === 'boolean') return false;
    if (!isVNode(node)) return true;
    if (node.type === Comment) return false;
    if (node.type === Fragment) return draws(node.children);
    return true;
  });
}

/**
 * Whether the measurement layer holds a part. A custom item without a
 * `#custom` slot is a socket, measured where it renders: a second <slot> of its
 * name here would take the projected children from the row. One the slot
 * draws nothing for here but draws in the row is measured there too, by
 * `measure`; one it draws in neither is its command's button, measured here.
 */
function measuredHere(part: Part): boolean {
  if (part.kind !== 'custom') return true;
  const custom = slots.custom;
  if (!custom) return false;
  const scope = { name: part.name, variant: part.variant, measure: noop };
  return (
    draws(custom({ ...scope, layer: 'measure' })) || !draws(custom({ ...scope, layer: 'live' }))
  );
}

/**
 * The hidden measurement layer: a row for a horizontal toolbar, a column for
 * a vertical one, and no height either way, so it never adds to the page. A
 * column keeps each item at its own width, so no text wraps and changes the
 * heights it reports.
 */
const measureLayerStyle = computed(() => ({
  position: 'absolute' as const,
  left: 0,
  top: 0,
  height: 0,
  overflow: 'hidden',
  visibility: 'hidden' as const,
  pointerEvents: 'none' as const,
  display: 'flex',
  whiteSpace: 'nowrap' as const,
  ...(vertical.value ? { flexDirection: 'column' as const, alignItems: 'flex-start' } : null),
}));
</script>

<template>
  <div
    ref="container"
    role="toolbar"
    :aria-orientation="orientation"
    :aria-label="ariaLabel"
    :style="{
      position: 'relative',
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems: 'center',
    }"
  >
    <div v-for="section in layout.sections" :key="section.name" :style="sectionStyle(section.name)">
      <template v-for="(group, index) in section.groups" :key="group.id">
        <slot v-if="index > 0" name="separator">
          <span :style="separatorStyle" />
        </slot>
        <span v-for="part in group.parts" :key="part.key" v-bind="TOOLBAR_ITEM" :style="ITEM_STYLE">
          <ToolbarPart :part="part" layer="live" :orientation="orientation" @length="onLength">
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
        </span>
      </template>
      <span
        v-if="section.name === 'end' && layout.hasOverflow"
        v-bind="TOOLBAR_ITEM"
        :style="{ position: 'relative', display: 'inline-flex' }"
      >
        <slot name="overflow-trigger" :is-open="overflowOpen" :toggle="toggleOverflow">
          <DefaultOverflowTrigger :is-open="overflowOpen" @toggle="toggleOverflow" />
        </slot>
        <slot name="overflow-menu" :view="overflowView">
          <DefaultOverflowMenu :view="overflowView" :orientation="orientation" />
        </slot>
      </span>
    </div>

    <!-- The measurement layer: hidden, inert and observed. Text reflow (a language, a font,
         browser zoom) fires the observers; no code handles it. -->
    <div aria-hidden="true" inert :style="measureLayerStyle">
      <template v-for="part in layout.measured" :key="part.measureKey">
        <Measured
          v-if="measuredHere(part)"
          :measure-key="part.measureKey"
          :orientation="orientation"
          @length="onLength"
        >
          <ToolbarPart :part="part" layer="measure" :orientation="orientation" @length="onLength">
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
      <Measured
        :measure-key="toolbarMeasureKey.overflowTrigger"
        :orientation="orientation"
        @length="onLength"
      >
        <slot name="overflow-trigger" :is-open="false" :toggle="noop">
          <DefaultOverflowTrigger :is-open="false" />
        </slot>
      </Measured>
    </div>
  </div>
</template>
