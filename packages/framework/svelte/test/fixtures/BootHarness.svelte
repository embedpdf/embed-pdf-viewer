<!-- A `<Viewer>` with its `fallback` and `error` snippets and gated content, for lifecycle tests. -->
<script lang="ts">
  import type { AnyPlugin, Engine, EngineFactory, InitialDocument } from '@embedpdf/core';
  import { DocumentGate, Viewer } from '../../src/runtime';
  import BootScreen from './BootScreen.svelte';

  let {
    engine,
    plugins,
    initialDocuments,
    statuses = [],
  }: {
    engine: Engine | EngineFactory;
    plugins: AnyPlugin[];
    initialDocuments?: InitialDocument[];
    statuses?: string[];
  } = $props();
</script>

<Viewer {engine} {plugins} {initialDocuments}>
  {#snippet fallback()}
    <BootScreen {statuses} />
  {/snippet}
  {#snippet error(error)}
    <div data-testid="boot-error">{String(error)}</div>
  {/snippet}
  <div data-testid="shell">shell</div>
  <DocumentGate>
    <div data-testid="doc-ui">document ready</div>
  </DocumentGate>
</Viewer>
