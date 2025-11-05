<script lang="ts">
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import { useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import type { MenuWrapperProps } from '@embedpdf/utils/svelte';

  interface AnnotationSelectionMenuProps {
    menuWrapperProps: MenuWrapperProps;
    annotation: TrackedAnnotation;
  }

  let { menuWrapperProps, annotation }: AnnotationSelectionMenuProps = $props();

  const annotationCapability = useAnnotationCapability();

  let anchorEl = $state<HTMLSpanElement | null>(null);

  function handleDelete() {
    if (!annotationCapability.provides) return;
    const { pageIndex, id } = annotation.object;
    annotationCapability.provides.deleteAnnotation(pageIndex, id);
  }
</script>

<span {...menuWrapperProps} bind:this={anchorEl}></span>

{#if anchorEl}
  <div
    class="pointer-events-auto absolute z-50 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg"
    style:top="{anchorEl.offsetTop + anchorEl.offsetHeight + 8}px"
    style:left="{anchorEl.offsetLeft}px"
  >
    <button
      onclick={handleDelete}
      class="flex items-center justify-center rounded p-1 text-gray-700 transition-colors hover:bg-gray-100"
      aria-label="Delete annotation"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        height="24px"
        viewBox="0 -960 960 960"
        width="24px"
        fill="currentColor"
        ><path
          d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
        /></svg
      >
    </button>
  </div>
{/if}
