<script lang="ts">
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import { useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import {type MenuWrapperProps, stylesToString} from '@embedpdf/utils/svelte';
  import type { Rect } from '@embedpdf/models';

  interface AnnotationSelectionMenuProps {
    menuWrapperProps: MenuWrapperProps;
    annotation: TrackedAnnotation;
    rect: Rect;
  }

  let { menuWrapperProps, annotation, rect }: AnnotationSelectionMenuProps = $props();

  const annotationCapability = useAnnotationCapability();

  let spanElement = $state<HTMLSpanElement | null>(null);

  $effect(() => {
    if (menuWrapperProps.ref && spanElement) {
      menuWrapperProps.ref(spanElement);
    }
    
    // Debug logging
    if (spanElement) {
      console.log('AnnotationSelectionMenu rendered', {
        rect,
        style: menuWrapperProps.style,
        boundingRect: spanElement.getBoundingClientRect()
      });
    }
  });

  function handleDelete() {
    if (!annotationCapability.provides) return;
    const { pageIndex, id } = annotation.object;
    annotationCapability.provides.deleteAnnotation(pageIndex, id);
  }
</script>

<span bind:this={spanElement} style={stylesToString(menuWrapperProps.style)}>
  <div
    class="pointer-events-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg"
    style:position="absolute"
    style:top="{rect.size.height + 8}px"
    style:left="{rect.size.width - 100}px"
    style:z-index="1000"
    style:cursor="default"
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
</span>
