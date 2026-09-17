<script lang="ts">
  import { useRegistry } from '@embedpdf/core/svelte';

  interface Props {
    label: string;
  }

  let { label }: Props = $props();

  const context = useRegistry();
</script>

<dl class="grid grid-cols-2 gap-x-2 border-t border-gray-200 px-3 py-2 font-mono text-xs">
  <dt class="text-gray-500">panel</dt>
  <dd class="text-gray-900">{label}</dd>

  <dt class="text-gray-500">registry</dt>
  <dd class="text-gray-900">{context.registry ? 'resolved' : 'null'}</dd>

  <dt class="text-gray-500">pluginsReady</dt>
  <dd class="text-gray-900">{context.pluginsReady}</dd>

  <dt class="text-gray-500">activeDocumentId</dt>
  <dd class="truncate text-gray-900">{context.activeDocumentId ?? '—'}</dd>

  <dt class="text-gray-500">documents</dt>
  <dd class="text-gray-900">{context.documentStates.length}</dd>
</dl>
