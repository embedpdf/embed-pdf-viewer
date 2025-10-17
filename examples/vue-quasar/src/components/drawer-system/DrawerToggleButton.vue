<script setup lang="ts">
import { inject, computed } from 'vue';
import type { DrawerComponent, DrawerPosition, DrawerState } from './types';

interface Props {
  componentId: string;
}

const props = defineProps<Props>();

const drawerContext = inject('drawerContext') as {
  registeredComponents: { value: DrawerComponent[] };
  drawerStates: Record<DrawerPosition, DrawerState>;
  showComponent: (id: string) => void;
  hideComponent: (position: DrawerPosition) => void;
  getActiveComponent: (position: DrawerPosition) => DrawerComponent | null;
};

const component = computed(() =>
  drawerContext.registeredComponents.value.find((comp) => comp.id === props.componentId),
);

const isThisComponentOpen = computed(() => {
  if (!component.value) return false;
  const { isOpen, activeComponentId } = drawerContext.drawerStates[component.value.position];
  return isOpen && activeComponentId === props.componentId;
});

const handleToggle = () => {
  if (!component.value) return;

  if (isThisComponentOpen.value) {
    drawerContext.hideComponent(component.value.position);
  } else {
    drawerContext.showComponent(props.componentId);
  }
};
</script>

<template>
  <q-btn
    v-if="component"
    flat
    round
    dense
    :color="isThisComponentOpen ? 'primary' : undefined"
    size="sm"
    :icon="component.icon"
    @click="handleToggle"
  >
    <q-tooltip>{{ component.label }}</q-tooltip>
  </q-btn>
</template>
