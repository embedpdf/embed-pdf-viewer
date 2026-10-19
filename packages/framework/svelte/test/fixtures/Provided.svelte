<!-- Probes given a kernel through `<KernelProvider>`, outside the `<Viewer>` that owns it. -->
<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import type { Kernel } from '@embedpdf/core';
  import { KernelProvider } from '../../src/runtime';
  import Probes from './Probes.svelte';

  let { kernel, probes }: { kernel: Kernel } & ComponentProps<typeof Probes> = $props();
</script>

<KernelProvider {kernel}>
  <Probes {probes} />
</KernelProvider>
