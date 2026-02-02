<script lang="ts">
  import { type SelectionMenuItem, getUIItemProps } from '@embedpdf/plugin-ui/svelte';
  import { useCommand } from '@embedpdf/plugin-commands/svelte';
  import CommandButton from '../components/CommandButton.svelte';

  interface Props {
    item: SelectionMenuItem & { type: 'command-button' };
    documentId: string;
  }

  let { item, documentId }: Props = $props();

  const command = useCommand(
    () => item.commandId,
    () => documentId,
  );
</script>

{#if command.current?.visible}
  <div {...getUIItemProps(item)}>
    <CommandButton commandId={item.commandId} {documentId} variant={item.variant} />
  </div>
{/if}
