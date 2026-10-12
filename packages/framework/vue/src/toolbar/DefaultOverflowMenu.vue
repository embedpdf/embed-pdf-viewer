<!--
  The default "More" menu: a minimal popover under its button in a horizontal
  toolbar and beside it in a vertical one. A press anywhere outside it closes
  it, and while it's open it takes the menu keys (`attachMenuKeys`): focus on
  its first row, the arrows, typeahead, Enter, and Escape back to its button. A
  row that opens a submenu keeps it open; every other row closes it after it
  runs.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { OverflowRow } from '@embedpdf/core-ui';
import { attachMenuKeys, focusablesIn, observeOutsidePress } from '@embedpdf/web';
import type { Orientation } from '@embedpdf/web';
import type { OverflowMenuView } from './views';
import { BORDER, SURFACE } from './paint';

const props = defineProps<{ view: OverflowMenuView; orientation: Orientation }>();

const menu = ref<HTMLElement | null>(null);
// On the element and whether it's open, never on the view: the toolbar hands a new view on every
// change, and attaching again would put focus back on the first row.
watch(
  [menu, () => props.view.isOpen],
  ([element, isOpen], _previous, onCleanup) => {
    if (!isOpen || !element) return;
    // The menu's parent holds its button too: a press on it is the button's own toggle.
    const container = element.parentElement ?? element;
    const trigger =
      focusablesIn(container).find((candidate) => !element.contains(candidate)) ?? null;
    const close = () => props.view.close();
    const stopOutside = observeOutsidePress(container, close);
    const detachKeys = attachMenuKeys(element, { trigger, close });
    onCleanup(() => {
      stopOutside();
      detachKeys();
    });
  },
  { immediate: true, flush: 'post' },
);

/** Under a horizontal toolbar's button, beside a vertical one's. */
const placement = computed(() =>
  props.orientation === 'vertical'
    ? { top: 0, insetInlineStart: '100%' }
    : { top: '100%', insetInlineEnd: 0 },
);

// Each row with its command resolved; a row whose command is unknown isn't drawn.
const sections = computed(() =>
  props.view.sections.map((section) => ({
    radio: section.role === 'radio',
    rows: section.rows.flatMap((row) => {
      const command = props.view.resolve(row.command);
      return command ? [{ row, command }] : [];
    }),
  })),
);

function choose(row: OverflowRow) {
  props.view.execute(row.command);
  if (row.type !== 'submenu') props.view.close();
}
</script>

<template>
  <div
    v-if="view.isOpen"
    ref="menu"
    role="menu"
    :style="{
      position: 'absolute',
      ...placement,
      zIndex: 41,
      minWidth: '200px',
      padding: '4px',
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }"
  >
    <template v-for="(section, index) in sections" :key="index">
      <div v-if="index > 0" :style="{ height: '1px', background: BORDER, margin: '4px 0' }" />
      <button
        v-for="{ row, command } in section.rows"
        :key="row.command"
        type="button"
        :role="section.radio ? 'menuitemradio' : 'menuitem'"
        :aria-checked="section.radio ? command.active : undefined"
        :disabled="!command.enabled"
        tabindex="-1"
        :style="{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '6px 8px',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          background: 'transparent',
          cursor: command.enabled ? 'pointer' : 'default',
          opacity: command.enabled ? 1 : 0.4,
          whiteSpace: 'nowrap',
        }"
        @click="choose(row)"
      >
        <span>{{ command.active && section.radio ? '• ' : '' }}{{ command.label }}</span>
        <span v-if="row.type === 'submenu'">▸</span>
      </button>
    </template>
  </div>
</template>
