<!--
  Gives everything inside a kernel someone else created and owns, so every reader in it works
  against that kernel: the full viewer's wrapper puts the components it shows in the viewer inside
  one. It never starts or destroys the kernel; `<Viewer>` is the component that owns one.

  The kernel is read once, like `<Viewer>`'s engine: to give a subtree another kernel, mount a new
  provider (`{#key kernel}`).
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { KernelBinding, setKernelHolder } from './binding.svelte';
  import { devWarn } from './dev';
  import type { KernelProviderProps } from './props';

  let { kernel, children }: KernelProviderProps = $props();

  const binding = new KernelBinding(untrack(() => kernel));
  setKernelHolder({ binding });
  // The provider stops following the kernel; the kernel keeps running for its owner.
  onDestroy(() => binding.dispose());

  $effect(() => {
    if (kernel !== binding.kernel) {
      devWarn(
        'kernel-provider-kernel',
        '<KernelProvider> reads kernel once; a new value is ignored. To give the subtree another ' +
          'kernel, mount a new <KernelProvider>, for example inside a {#key kernel} block.',
      );
    }
  });
</script>

{@render children?.()}
