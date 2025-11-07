<script setup lang="ts">
import type { DocumentState } from '@embedpdf/core';

interface TabBarProps {
  documentStates: DocumentState[];
  activeDocumentId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpenFile: () => void;
}

const props = defineProps<TabBarProps>();
</script>

<template>
  <div class="tab-bar">
    <div class="tabs-container">
      <!-- Document Tabs -->
      <div
        v-for="document in props.documentStates"
        :key="document.id"
        :class="['tab', { active: props.activeDocumentId === document.id }]"
        @click="props.onSelect(document.id)"
        role="tab"
        :aria-selected="props.activeDocumentId === document.id"
        @keydown.enter.space.prevent="props.onSelect(document.id)"
        tabindex="0"
      >
        <!-- Document Icon -->
        <v-icon size="small" class="tab-icon">mdi-file-document</v-icon>

        <!-- Document Name -->
        <span class="tab-name">
          {{ document.name ?? `Document ${document.id.slice(0, 8)}` }}
        </span>

        <!-- Close Button -->
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          class="tab-close"
          :class="{ 'always-visible': props.activeDocumentId === document.id }"
          @click.stop="props.onClose(document.id)"
          :aria-label="`Close ${document.name ?? 'document'}`"
        />
      </div>

      <!-- Add Tab Button -->
      <v-btn
        icon="mdi-plus"
        size="small"
        variant="text"
        class="add-tab-btn"
        @click="props.onOpenFile"
        aria-label="Open File"
        title="Open File"
      />
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  background-color: rgb(245, 245, 245);
  padding: 8px 8px 0 8px;
  display: flex;
  align-items: flex-end;
}

.tabs-container {
  display: flex;
  flex: 1;
  align-items: flex-end;
  gap: 2px;
  overflow-x: auto;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  max-width: 240px;
  padding: 10px 12px;
  border-radius: 8px 8px 0 0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background-color: rgba(158, 158, 158, 0.2);
  color: rgba(0, 0, 0, 0.6);
  user-select: none;
}

.tab:hover {
  background-color: rgba(158, 158, 158, 0.3);
  color: rgba(0, 0, 0, 0.87);
}

.tab.active {
  background-color: white;
  color: rgba(0, 0, 0, 0.87);
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.tab-icon {
  flex-shrink: 0;
}

.tab-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.tab:hover .tab-close,
.tab-close.always-visible {
  opacity: 1;
}

.add-tab-btn {
  margin-left: 4px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
</style>
