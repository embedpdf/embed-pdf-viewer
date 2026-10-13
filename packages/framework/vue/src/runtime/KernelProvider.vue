<!--
  <KernelProvider :kernel>: gives its content a kernel someone else created and
  owns, so every composable inside works against that kernel. The full viewer's
  Vue wrapper puts the components it shows in the viewer inside one. It never
  starts or destroys the kernel; <Viewer> is the component that owns one. The
  kernel is read once: for another one, mount a new provider (a new `key`).
-->
<script setup lang="ts">
import { onScopeDispose, shallowRef, toRaw, watch } from 'vue';
import type { Kernel } from '@embedpdf/core';
import { devWarn } from '../dev';
import { provideViewer } from './kernel';

const props = defineProps<{
  /** The kernel, created and started by its owner. Read once. */
  kernel: Kernel;
}>();

defineSlots<{ default?(): unknown }>();

// Read once, as `<Viewer>` reads its engine: the composables inside took this kernel when they
// were set up, and a new one under them would leave them reading the old one. Raw, because a
// reactive copy of the kernel is another object.
const kernel = toRaw(props.kernel);
watch(
  () => props.kernel,
  () =>
    devWarn(
      'kernel-provider-kernel-init-only',
      '<KernelProvider> kernel is read once, when it mounts; another kernel is ignored. ' +
        'To give its content another kernel, mount a new <KernelProvider>, for example with a new `key`.',
    ),
);

// Goes up on every change the kernel announces; every reader's computed depends on it.
const revision = shallowRef(0);
onScopeDispose(
  kernel.subscribe(() => {
    revision.value += 1;
  }),
);

provideViewer({
  kernel,
  track: () => {
    void revision.value;
  },
});
</script>

<template>
  <slot />
</template>
