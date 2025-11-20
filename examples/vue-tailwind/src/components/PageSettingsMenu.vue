<template>
  <div v-if="rotate && spread" class="relative">
    <ToolbarButton
      :onClick="() => (isOpen = !isOpen)"
      :isActive="isOpen"
      aria-label="Page Settings"
      title="Page Settings"
    >
      <SettingsIcon class="h-4 w-4" />
    </ToolbarButton>

    <DropdownMenu :isOpen="isOpen" :onClose="() => (isOpen = false)" className="w-56">
      <DropdownSection title="Page Orientation">
        <DropdownItem
          :onClick="
            () => {
              rotate?.rotateForward();
              isOpen = false;
            }
          "
        >
          <template #icon>
            <RotateRightIcon class="h-4 w-4" title="Rotate Clockwise" />
          </template>
          Rotate Clockwise
        </DropdownItem>
        <DropdownItem
          :onClick="
            () => {
              rotate?.rotateBackward();
              isOpen = false;
            }
          "
        >
          <template #icon>
            <RotateLeftIcon class="h-4 w-4" title="Rotate Counter-clockwise" />
          </template>
          Rotate Counter-clockwise
        </DropdownItem>
      </DropdownSection>

      <DropdownDivider />

      <DropdownSection title="Page Layout">
        <DropdownItem
          :onClick="
            () => {
              spread?.setSpreadMode(SpreadMode.None);
              isOpen = false;
            }
          "
          :isActive="spreadMode === SpreadMode.None"
        >
          <template #icon>
            <SinglePageIcon class="h-4 w-4" title="Single Page" />
          </template>
          Single Page
        </DropdownItem>
        <DropdownItem
          :onClick="
            () => {
              spread?.setSpreadMode(SpreadMode.Odd);
              isOpen = false;
            }
          "
          :isActive="spreadMode === SpreadMode.Odd"
        >
          <template #icon>
            <BookOpenIcon class="h-4 w-4" title="Odd Pages" />
          </template>
          Odd Pages
        </DropdownItem>
        <DropdownItem
          :onClick="
            () => {
              spread?.setSpreadMode(SpreadMode.Even);
              isOpen = false;
            }
          "
          :isActive="spreadMode === SpreadMode.Even"
        >
          <template #icon>
            <BookOpenIcon class="h-4 w-4" title="Even Pages" />
          </template>
          Even Pages
        </DropdownItem>
      </DropdownSection>
    </DropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRotate } from '@embedpdf/plugin-rotate/vue';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/vue';
import {
  SettingsIcon,
  RotateRightIcon,
  RotateLeftIcon,
  SinglePageIcon,
  BookOpenIcon,
} from './icons';
import { ToolbarButton, DropdownMenu, DropdownSection, DropdownItem, DropdownDivider } from './ui';

const props = defineProps<{
  documentId: string;
}>();

const { provides: rotate } = useRotate(() => props.documentId);
const { spreadMode, provides: spread } = useSpread(() => props.documentId);
const isOpen = ref(false);
</script>
