<script lang="ts">
  import { useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import type { AnnotationTool } from '@embedpdf/plugin-annotation/svelte';
  import { onMount } from 'svelte';

  const annotationCapability = useAnnotationCapability();

  let activeTool = $state<AnnotationTool | null>(null);

  onMount(() => {
    if (!annotationCapability.provides) return;

    // Initialize current tool on mount
    activeTool = annotationCapability.provides.getActiveTool();

    // Subscribe to changes
    const unsubscribe = annotationCapability.provides.onActiveToolChange((tool) => {
      activeTool = tool;
    });

    return unsubscribe;
  });

  function handleToolClick(toolId: string) {
    if (!annotationCapability.provides) return;
    const currentId = activeTool?.id ?? null;
    annotationCapability.provides.setActiveTool(currentId === toolId ? null : toolId);
  }
</script>

<div
  class="flex w-full items-center justify-center gap-2 border-b border-gray-300 bg-white px-4 py-2"
>
  <!-- Free Text -->
  <button
    class="flex h-8 w-8 items-center justify-center rounded-full text-gray-700 transition-colors {activeTool?.id ===
    'freeText'
      ? 'bg-blue-100 text-blue-700'
      : 'hover:bg-gray-200'}"
    onclick={() => handleToolClick('freeText')}
    title="Text annotation"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="currentColor"
      ><path
        d="M280-160v-520H80v-120h520v120H400v520H280Zm360 0v-320H520v-120h360v120H760v320H640Z"
      /></svg
    >
  </button>

  <!-- Ink -->
  <button
    class="flex h-8 w-8 items-center justify-center rounded-full text-gray-700 transition-colors {activeTool?.id ===
    'ink'
      ? 'bg-blue-100 text-blue-700'
      : 'hover:bg-gray-200'}"
    onclick={() => handleToolClick('ink')}
    title="Freehand annotation"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="currentColor"
      ><path
        d="M554-120q-54 0-91-37t-37-89q0-76 61.5-137.5T641-460q-3-36-18-54.5T582-533q-30 0-65 25t-83 82q-78 93-114.5 121T241-277q-51 0-86-38t-35-92q0-54 23.5-110.5T223-653q19-26 28-44t9-29q0-7-2.5-10.5T250-740q-10 0-25 12.5T190-689l-70-71q32-39 65-59.5t65-20.5q46 0 78 32t32 80q0 29-15 64t-50 84q-38 54-56.5 95T220-413q0 17 5.5 26.5T241-377q10 0 17.5-5.5T286-409q13-14 31-34.5t44-50.5q63-75 114-107t107-32q67 0 110 45t49 123h99v100h-99q-8 112-58.5 178.5T554-120Zm2-100q32 0 54-36.5T640-358q-46 11-80 43.5T526-250q0 14 8 22t22 8Z"
      /></svg
    >
  </button>

  <!-- Circle -->
  <button
    class="flex h-8 w-8 items-center justify-center rounded-full text-gray-700 transition-colors {activeTool?.id ===
    'circle'
      ? 'bg-blue-100 text-blue-700'
      : 'hover:bg-gray-200'}"
    onclick={() => handleToolClick('circle')}
    title="Circle annotation"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="currentColor"
      ><path
        d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
      /></svg
    >
  </button>

  <!-- Square -->
  <button
    class="flex h-8 w-8 items-center justify-center rounded-full text-gray-700 transition-colors {activeTool?.id ===
    'square'
      ? 'bg-blue-100 text-blue-700'
      : 'hover:bg-gray-200'}"
    onclick={() => handleToolClick('square')}
    title="Square annotation"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="currentColor"
      ><path d="M120-120v-720h720v720H120Zm80-80h560v-560H200v560Zm0 0v-560 560Z" /></svg
    >
  </button>

  <!-- Line Arrow -->
  <button
    class="flex h-8 w-8 items-center justify-center rounded-full text-gray-700 transition-colors {activeTool?.id ===
    'lineArrow'
      ? 'bg-blue-100 text-blue-700'
      : 'hover:bg-gray-200'}"
    onclick={() => handleToolClick('lineArrow')}
    title="Line arrow annotation"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="currentColor"><path d="m216-160-56-56 464-464H360v-80h400v400h-80v-264L216-160Z" /></svg
    >
  </button>

  <!-- Stamp Approved -->
  <button
    class="flex h-8 w-8 items-center justify-center rounded-full text-gray-700 transition-colors {activeTool?.id ===
    'stampApproved'
      ? 'bg-blue-100 text-blue-700'
      : 'hover:bg-gray-200'}"
    onclick={() => handleToolClick('stampApproved')}
    title="Stamp approved"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="currentColor"
      ><path
        d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
      /></svg
    >
  </button>
</div>
