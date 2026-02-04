<script lang="ts">
  import { type SelectionMenuRendererProps, getUIItemProps } from '@embedpdf/plugin-ui/svelte';
  import SelectionMenuItemRenderer from './SelectionMenuItemRenderer.svelte';

  let { schema, documentId, props }: SelectionMenuRendererProps = $props();

  const menuStyle = $derived.by(() => {
    let style = `
      position: absolute;
      pointer-events: auto;
      cursor: default;
      left: 50%;
      transform: translateX(-50%);
    `;

    if (props.placement?.suggestTop) {
      style += 'top: -48px;';
    } else {
      style += `top: ${props.rect.size.height + 8}px;`;
    }

    return style;
  });
</script>

<div
  style={props.menuWrapperProps.style}
  use:props.menuWrapperProps.action
  {...getUIItemProps(schema)}
>
  <div style={menuStyle} class="rounded-lg border border-gray-200 bg-white shadow-lg">
    <div class="flex items-center gap-1 px-2 py-1">
      {#each schema.items as item (item.id)}
        <SelectionMenuItemRenderer {item} {documentId} {props} />
      {/each}
    </div>
  </div>
</div>
