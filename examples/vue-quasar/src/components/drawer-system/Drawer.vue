<script setup lang="ts">
import { inject, computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { DrawerComponent, DrawerPosition, DrawerState } from './types';

interface Props {
  position: DrawerPosition;
  width?: number;
}

const props = withDefaults(defineProps<Props>(), {
  width: 320,
});

const $q = useQuasar();
const expanded = ref(false);

const drawerContext = inject('drawerContext') as {
  registeredComponents: { value: DrawerComponent[] };
  drawerStates: Record<DrawerPosition, DrawerState>;
  showComponent: (id: string) => void;
  hideComponent: (position: DrawerPosition) => void;
  getActiveComponent: (position: DrawerPosition) => DrawerComponent | null;
};

const isMobile = computed(() => $q.screen.lt.md);
const isOpen = computed(() => drawerContext.drawerStates[props.position].isOpen);
const activeComponent = computed(() => drawerContext.getActiveComponent(props.position));

const mobileModel = computed({
  get: () => isOpen.value,
  set: (value: boolean) => {
    if (!value) {
      handleClose();
    }
  },
});

const desktopModel = computed({
  get: () => isOpen.value,
  set: (value: boolean) => {
    if (!value) {
      handleClose();
    }
  },
});

const handleClose = () => {
  expanded.value = false;
  drawerContext.hideComponent(props.position);
};

const toggleExpanded = () => {
  expanded.value = !expanded.value;
};
</script>

<template>
  <!-- Mobile Bottom Sheet -->
  <q-dialog
    v-if="isMobile"
    v-model="mobileModel"
    position="bottom"
    :maximized="expanded"
    transition-show="jump-up"
    transition-hide="jump-down"
    class="drawer-mobile"
  >
    <q-card
      class="column full-height"
      :style="{ height: expanded ? '100vh' : '55vh' }"
    >
      <div class="drawer-mobile__header row items-center justify-between q-pa-md">
        <div class="row items-center">
          <div class="drawer-grip q-mx-auto" @click="toggleExpanded" />
          <span v-if="activeComponent" class="q-ml-md text-subtitle1">
            {{ activeComponent.label }}
          </span>
        </div>
        <q-btn flat round dense icon="mdi-close" @click="handleClose" />
      </div>
      <q-separator />
      <div class="drawer-mobile__content col scroll">
        <component
          v-if="activeComponent"
          :is="activeComponent.component"
          v-bind="activeComponent.props || {}"
        />
      </div>
    </q-card>
  </q-dialog>

  <!-- Desktop Side Drawer -->
  <q-drawer
    v-else
    v-model="desktopModel"
    :side="position"
    :width="width"
    bordered
    behavior="desktop"
    class="drawer-desktop"
  >
    <div v-if="activeComponent" class="column fit">
      <q-toolbar class="bg-grey-2 text-weight-medium drawer-desktop__toolbar">
        <q-toolbar-title class="text-subtitle1">
          {{ activeComponent.label }}
        </q-toolbar-title>
        <q-btn flat round dense icon="mdi-close" @click="handleClose" />
      </q-toolbar>
      <q-separator />
      <div class="drawer-desktop__content col scroll">
        <component :is="activeComponent.component" v-bind="activeComponent.props || {}" />
      </div>
    </div>
  </q-drawer>
</template>

<style scoped>
.drawer-desktop {
  transition: width 0.2s ease;
}

.drawer-desktop__toolbar {
  min-height: 48px;
}

.drawer-desktop__content {
  padding: 0;
}

.drawer-mobile__header {
  min-height: 48px;
}

.drawer-mobile__content {
  padding: 0 16px 16px;
}

.drawer-grip {
  width: 32px;
  height: 4px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.drawer-grip:hover {
  opacity: 0.6;
}
</style>
