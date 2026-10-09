<!--
  The default "More" menu: a minimal popover under its button, with a
  transparent backdrop that closes it. A row that opens a submenu stays open;
  every other row closes the menu after it runs.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { OverflowRow } from '@embedpdf/core-ui';
import type { OverflowMenuView } from './views';
import { BORDER, SURFACE } from './paint';

const props = defineProps<{ view: OverflowMenuView }>();

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
  <template v-if="view.isOpen">
    <div :style="{ position: 'fixed', inset: 0, zIndex: 40 }" @click="view.close()" />
    <div
      role="menu"
      :style="{
        position: 'absolute',
        right: 0,
        top: '100%',
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
</template>
