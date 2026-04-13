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
  style:border-radius="50%"
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
    <div
      style:width="50%"
      style:height="50%"
      style:border-radius="50%"
      style:background="#000000"
    ></div>
  {/if}
</div>
