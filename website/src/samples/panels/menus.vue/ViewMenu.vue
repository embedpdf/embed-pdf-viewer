<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useShell, useShellState } from '@embedpdf/vue/shell';

const TOOLS = [
  { id: 'pointer', label: 'Select text' },
  { id: 'pan', label: 'Scroll with the hand' },
];

// A menu with a submenu: opening the submenu leaves its menu open.
const shell = useShell();
const interaction = useInteraction();
const { openMenus } = useShellState();
const { activeToolId } = useInteractionState();
const bar = ref<HTMLDivElement | null>(null);
const anyOpen = computed(() => openMenus.value.length > 0);

// A press outside the menus, or Escape, closes all of them.
watch(
  anyOpen,
  (open, _previous, onCleanup) => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!bar.value?.contains(event.target as Node)) shell.closeAllMenus();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') shell.closeAllMenus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    onCleanup(() => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    });
  },
  { immediate: true },
);

function choose(toolId: string) {
  interaction.activateTool(toolId);
  shell.closeAllMenus();
}
</script>

<template>
  <div class="toolbar">
    <div ref="bar" class="menubar">
      <button
        type="button"
        class="button"
        aria-haspopup="menu"
        :aria-expanded="openMenus.includes('view')"
        @click="shell.toggleMenu('view')"
      >
        View ▾
      </button>
      <div v-if="openMenus.includes('view')" class="menu" role="menu">
        <button
          type="button"
          role="menuitem"
          class="menu-item"
          aria-haspopup="menu"
          :aria-expanded="openMenus.includes('view-tool')"
          @click="shell.toggleMenu('view-tool')"
        >
          Tool <span aria-hidden="true">▸</span>
        </button>
        <button type="button" role="menuitem" class="menu-item" @click="shell.closeAllMenus()">
          Close menus
        </button>
        <div v-if="openMenus.includes('view-tool')" class="menu submenu" role="menu">
          <button
            v-for="tool in TOOLS"
            :key="tool.id"
            type="button"
            role="menuitemradio"
            :aria-checked="tool.id === activeToolId"
            class="menu-item"
            @click="choose(tool.id)"
          >
            {{ tool.label }}
          </button>
        </div>
      </div>
    </div>
    <output class="readout">Open menus: {{ anyOpen ? openMenus.join(' › ') : 'none' }}</output>
  </div>
</template>
