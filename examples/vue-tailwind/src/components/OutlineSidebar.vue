<template>
  <div class="flex h-full flex-col gap-3 p-4 text-sm text-gray-600">
    <div class="font-medium text-gray-900">Outline (Coming Soon)</div>
    <p>
      Placeholder outline for document
      <code class="rounded bg-gray-100 px-1 py-0.5">{{ documentId }}</code
      >.
    </p>
    <p class="text-xs">
      Implement the actual outline sidebar by replacing this placeholder with a component that reads
      the document outline from the appropriate plugin.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Placeholder Outline Sidebar
 *
 * This component will eventually render the document outline / table of contents.
 * For now it simply renders a placeholder so that we can test tabbed panels.
 */

interface Props {
  documentId: string;
}

defineProps<Props>();
</script>
