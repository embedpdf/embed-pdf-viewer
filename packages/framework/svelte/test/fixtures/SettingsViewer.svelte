<!-- A `<Viewer>` whose settings props a test changes, with a probe of the accent inside. -->
<script lang="ts">
  import type { AnyPlugin, Engine, Kernel } from '@embedpdf/core';
  import { Viewer } from '../../src/runtime';
  import Probe from './Probe.svelte';
  import { useViewerSettings } from '../../src/runtime';
  import { bytesInput } from './counter-plugin';

  let {
    engine,
    plugins,
    accent,
    scope,
    accents,
    onReady,
  }: {
    engine: Engine;
    plugins: AnyPlugin[];
    accent?: string;
    scope?: string[];
    accents: unknown[];
    onReady: (kernel: Kernel) => void;
  } = $props();
</script>

<Viewer
  {engine}
  {plugins}
  identity={{ userId: 'u1' }}
  page={{ shadow: 'none' }}
  {accent}
  {scope}
  {onReady}
  initialDocuments={[{ source: bytesInput('a') }]}
>
  <span data-testid="probe"></span>
  <Probe
    read={() => useViewerSettings((settings) => settings.accent)}
    pick={(value) => value.current}
    seen={accents}
  />
</Viewer>
