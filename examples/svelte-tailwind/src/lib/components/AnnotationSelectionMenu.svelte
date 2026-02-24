<script lang="ts">
  import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
  import { useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import { type MenuWrapperProps } from '@embedpdf/utils/svelte';
  import type { Rect } from '@embedpdf/models';
  import { Trash2 } from 'lucide-svelte';

  interface AnnotationSelectionMenuProps {
    selected: boolean;
    menuWrapperProps: MenuWrapperProps;
    annotation: TrackedAnnotation;
    rect: Rect;
  }

  let { menuWrapperProps, annotation, rect, selected }: AnnotationSelectionMenuProps = $props();

  const annotationCapability = useAnnotationCapability();

  function handleDelete() {
    if (!annotationCapability.provides) return;
    const { pageIndex, id } = annotation.object;
    annotationCapability.provides.deleteAnnotation(pageIndex, id);
  }
</script>

<span style={menuWrapperProps.style} use:menuWrapperProps.action>
  {#if selected}
    <div
      class="pointer-events-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      style:position="absolute"
      style:top="{rect.size.height + 8}px"
      style:left="50%"
      style:transform="translateX(-50%)"
      style:z-index="1000"
      style:cursor="default"
    >
      <button
        onclick={handleDelete}
        class="flex items-center justify-center rounded p-1.5 text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        aria-label="Delete annotation"
      >
        <Trash2 size={18} />
      </button>
    </div>
  {/if}
</span>
