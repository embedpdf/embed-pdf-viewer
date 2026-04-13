<script lang="ts">
  import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/svelte';
  import type { PdfWidgetAnnoObject } from '@embedpdf/models';
  import { isWidgetChecked } from '@embedpdf/models';

  let {
    annotation,
    currentObject,
    isSelected,
    scale,
    onClick,
  }: AnnotationRendererProps<PdfWidgetAnnoObject> = $props();

  let isHovered = $state(false);

  const object = $derived(currentObject);
  const isChecked = $derived(isWidgetChecked(object));
  const borderWidth = $derived((object.strokeWidth ?? 1) * scale);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerdown={(e) => {
    if (!isSelected) onClick?.(e);
  }}
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  style:position="absolute"
  style:inset="0"
  style:background={object.color ?? '#FFFFFF'}
  style:border="{borderWidth}px solid {object.strokeColor ?? '#000000'}"
  style:outline={isHovered || isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none'}
  style:outline-offset="-1px"
  style:box-sizing="border-box"
  style:pointer-events="auto"
  style:cursor={isSelected ? 'move' : 'pointer'}
  style:display="flex"
  style:align-items="center"
  style:justify-content="center"
>
  {#if isChecked}
    <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
      <path
        d="M28 48C27.45 50.21 29.45 63.13 30 67C30.55 69.21 34.58 72 39 72C44.52 71.45 76.55 32.55 76 32C77.1 31.45 76 25 76 25C74.34 22.24 68 25.45 68 26C68 26 43.55 53 43 53C41.34 53 40.55 41.1 40 40C33.37 36.69 29.1 45.79 28 48Z"
        fill="#000000"
      />
    </svg>
  {/if}
</div>
