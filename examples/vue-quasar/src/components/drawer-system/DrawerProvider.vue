<script setup lang="ts">
import { provide, reactive, computed } from 'vue';
import { useQuasar } from 'quasar';
import type { DrawerComponent, DrawerPosition, DrawerState } from './types';

interface Props {
  components: DrawerComponent[];
}

const props = defineProps<Props>();

const $q = useQuasar();
const isMobile = computed(() => $q.screen.lt.md);

const drawerStates = reactive<Record<DrawerPosition, DrawerState>>({
  left: { isOpen: false, activeComponentId: null },
  right: { isOpen: false, activeComponentId: null },
});

const registeredComponents = computed(() => props.components);

const showComponent = (id: string) => {
  const component = registeredComponents.value.find((c) => c.id === id);
  if (!component) return;

  // If we're on mobile, close every drawer first
  if (isMobile.value) {
    drawerStates.left = { isOpen: false, activeComponentId: null };
    drawerStates.right = { isOpen: false, activeComponentId: null };
  }

  drawerStates[component.position] = { isOpen: true, activeComponentId: id };
};

const hideComponent = (position: DrawerPosition) => {
  drawerStates[position] = {
    isOpen: false,
    activeComponentId: null,
  };
};

const getActiveComponent = (position: DrawerPosition): DrawerComponent | null => {
  const activeId = drawerStates[position].activeComponentId;
  return registeredComponents.value.find((comp) => comp.id === activeId) || null;
};

// Provide the drawer context
provide('drawerContext', {
  registeredComponents,
  drawerStates,
  showComponent,
  hideComponent,
  getActiveComponent,
});
</script>

<template>
  <slot />
</template>
