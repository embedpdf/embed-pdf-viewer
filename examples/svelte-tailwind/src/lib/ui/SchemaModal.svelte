<script lang="ts">
  import type { ModalRendererProps } from '@embedpdf/plugin-ui/svelte';
  import { useItemRenderer } from '@embedpdf/plugin-ui/svelte';

  /**
   * Schema-driven Modal Renderer for Svelte
   *
   * Renders modals defined in the UI schema.
   * Supports animation lifecycle via isOpen and onExited props.
   */

  interface Props extends ModalRendererProps {}

  let { schema, documentId, isOpen, onClose, onExited }: Props = $props();

  const { getCustomComponent } = useItemRenderer();

  const ModalComponent = $derived.by(() => {
    const { content } = schema;

    if (content.type !== 'component') {
      console.warn(`SchemaModal only supports component content type, got: ${content.type}`);
      return undefined;
    }

    return getCustomComponent(content.componentId);
  });
</script>

{#if ModalComponent}
  <ModalComponent {documentId} {isOpen} {onClose} {onExited} />
{/if}
