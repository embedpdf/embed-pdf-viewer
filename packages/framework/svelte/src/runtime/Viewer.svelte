<!--
  The viewer: owns the kernel for as long as it is mounted, and gives it to everything inside.

  The kernel is made in the browser only, when the viewer mounts (an effect, so server rendering
  makes nothing). Its fallback shows from then on, with the kernel already in context, so a
  loading screen can use workspace plugins. The content mounts once `start()` resolves, which
  never touches the engine: the shell is alive while WASM compiles or the transport connects.
  `initialDocuments` then open in the background; per-document loading is `<DocumentGate>`'s job.

  Engine ownership follows the shape of `engine`: a function is the viewer's own (made on mount,
  destroyed after the kernel on unmount), an instance is borrowed (warmed up, never destroyed).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { createKernel, isLocalEngine, viewerSettingsOf } from '@embedpdf/core';
  import type { Engine, EngineFactory, Kernel, ViewerSettings } from '@embedpdf/core';
  import { KernelBinding, setKernelHolder } from './binding.svelte';
  import { isDev } from './dev';
  import type { ViewerProps } from './props';

  let {
    engine,
    plugins,
    initialDocuments,
    onReady,
    identity,
    scope,
    accent,
    page,
    fallback,
    error: renderError,
    children,
  }: ViewerProps = $props();

  type Boot =
    | { phase: 'booting'; binding: KernelBinding | null }
    | { phase: 'ready'; binding: KernelBinding }
    | { phase: 'error'; error: unknown };

  let boot = $state.raw<Boot>({ phase: 'booting', binding: null });
  setKernelHolder({
    get binding() {
      return boot.phase === 'error' ? null : boot.binding;
    },
  });

  // The viewer's settings as the props give them: a prop left out is its default.
  const settings = $derived<ViewerSettings>(viewerSettingsOf({ identity, scope, accent, page }));

  // One kernel per mount. Everything is read untracked, so nothing a prop does later runs this
  // again: `engine`, `plugins` and `initialDocuments` are read once.
  $effect(() =>
    untrack(() => {
      const ownsEngine = typeof engine === 'function';
      const created: Engine = ownsEngine ? (engine as EngineFactory)() : (engine as Engine);
      if (isLocalEngine(created)) created.warmup();
      let kernel: Kernel;
      try {
        kernel = createKernel({ engine: created, plugins, settings });
      } catch (error) {
        // A plugin graph that can't be built shows `error`, not an exception mid-render.
        boot = { phase: 'error', error };
        if (ownsEngine) void created.destroy();
        return;
      }
      const binding = new KernelBinding(kernel);
      const documents = initialDocuments ?? [];
      let alive = true;
      boot = { phase: 'booting', binding };
      kernel.start().then(
        () => {
          if (!alive) return; // unmounted while starting: open nothing
          onReady?.(kernel);
          boot = { phase: 'ready', binding };
          // Every tab appears at once in order; the `active` entry (else the first) is selected,
          // and a failure shows as that tab's status.
          kernel.documents.openAll(documents);
        },
        (error: unknown) => {
          if (alive) boot = { phase: 'error', error };
        },
      );
      return () => {
        alive = false;
        binding.dispose();
        // The kernel first (it closes every document handle), then the engine we own.
        void kernel.destroy().then(() => {
          if (ownsEngine) void created.destroy();
        });
      };
    }),
  );

  // Later settings reach the kernel as they change; settings that didn't change change nothing.
  $effect(() => {
    const next = settings;
    if (boot.phase !== 'error') boot.binding?.kernel.updateSettings(next);
  });

  // `engine` and `plugins` are read once: say so when they change after the viewer mounted.
  const mounted = untrack(() => ({ engine, plugins }));
  let warned = false;
  $effect(() => {
    if (warned || !isDev()) return;
    if (engine !== mounted.engine || plugins !== mounted.plugins) {
      warned = true;
      console.warn(
        '[embedpdf] <Viewer> reads engine and plugins once, when it mounts; a new value is ignored. ' +
          'To use other ones, mount a new <Viewer>, for example inside a {#key} block.',
      );
    }
  });
</script>

{#if boot.phase === 'error'}
  {@render renderError?.(boot.error)}
{:else if boot.binding}
  {#if boot.phase === 'ready'}
    {@render children?.()}
  {:else}
    {@render fallback?.()}
  {/if}
{/if}
