<!--
  <PDFViewer>: the Svelte face of the <embedpdf-viewer> custom element, and engine-blind: it
  imports the viewer for types only, so it holds no runtime edge to any engine. Which engine ships
  is decided by the entry that re-exports it: `./index.ts` imports `@embedpdf/viewer` (the built-in
  local engine, registered as the default), `./core.ts` imports `@embedpdf/viewer/core` (no default
  engine: you give one, and PDFium is not in the module graph). That one import is the whole
  difference between the two doors, and it lives only in those two files.

  It renders the element and gives it the config before the element's deferred first mount, so the
  viewer starts once, with it. `src`, `theme`, `locale`, `disable`, `readOnly` and `fetch` follow
  their props: the element changes them in place, comparing by value. Every other prop is read once: a
  later change is ignored (development warns), and a `{#key}` block mounts a new viewer with it.
  `onready`, `ondocumentchange` and `onpanelresize` call the latest prop.

  Your components are its children, light DOM the browser shows in the viewer's slots while they
  stay in your Svelte tree, with your context, state and CSS. They mount once the viewer is ready,
  inside its kernel, so the headless functions of `@embedpdf/svelte` in them read this viewer, and
  `usePDFViewer()` gives them its `viewer`. When the viewer goes they unmount with it, and mount
  again inside the next one. On the server it renders the empty element, and the viewer starts in
  the browser.
-->
<script lang="ts">
  import { DEV } from 'esm-env';
  import { untrack } from 'svelte';
  // The headless runtime carries no engine: it gives the children the viewer's kernel.
  import { KernelProvider, type Kernel } from '@embedpdf/svelte/runtime';
  // `ElementConfig` is the kernel's config, the widest of all, with the engine seam `unknown`: the
  // shared implementation sits above every door, and each entry narrows it by assignment.
  import type { ElementConfig, Viewer } from '@embedpdf/viewer/core';
  import { changedReadOnceKey, liveConfigOf, readOnceWarning } from './config';
  import { setViewerContext } from './hooks';
  import type { PDFViewerImplProps } from './props';

  let {
    class: className,
    style,
    children,
    element = $bindable(null),
    onready,
    ondocumentchange,
    onpanelresize,
    ...config
  }: PDFViewerImplProps = $props();

  // The viewer once it's ready: the children render inside its kernel. Before that the viewer has
  // no slots to show them in.
  let viewer = $state.raw<Viewer | null>(null);
  setViewerContext(() => viewer);

  /** Where the viewer keeps its kernel (`createViewer` in `@embedpdf/viewer-chrome`). */
  const VIEWER_KERNEL = Symbol.for('@embedpdf/viewer/kernel');
  const kernel = $derived(
    viewer ? ((viewer as unknown as Partial<Record<symbol, Kernel>>)[VIEWER_KERNEL] ?? null) : null,
  );

  // The config the viewer starts with: the props as they are now, read once. The callbacks reach
  // the element once too, as functions that read the prop when they're called, so an inline
  // handler that changes is the one called.
  const initial = untrack(() => ({ ...config }));
  const started: ElementConfig = {
    ...initial,
    onReady: (ready) => {
      viewer = ready;
      onready?.(ready);
    },
    onDocumentChange: (documentId) => ondocumentchange?.(documentId),
    onPanelResize: (event) => onpanelresize?.(event),
  };

  // The element's attributes and properties. Svelte sets a property while it creates the element,
  // before the element is on the page, so `config` is there for its first mount; the live keys are
  // set again when they change, and the element compares them by value (an inline array is no
  // change). On the server there are no properties: it renders the empty element.
  const attributes = $derived({
    class: className,
    style,
    ...(typeof document === 'undefined' ? {} : { config: started, ...liveConfigOf(config) }),
  });

  // Every other prop is read once: say so, once, when one changes after the viewer started.
  // A development build, as Svelte itself reads it.
  if (DEV) {
    let warned = false;
    $effect(() => {
      if (warned) return;
      const key = changedReadOnceKey(initial, { ...config });
      if (key === null) return;
      warned = true;
      console.warn(readOnceWarning(key));
    });
  }
</script>

<!-- The element waits for the config set here, also over the server's HTML before hydration. -->
<embedpdf-viewer bind:this={element} data-epdf-wrapped="" {...attributes}>
  {#if viewer}
    {#key viewer}
      {#if kernel}
        <KernelProvider {kernel}>{@render children?.()}</KernelProvider>
      {:else}
        {@render children?.()}
      {/if}
    {/key}
  {/if}
</embedpdf-viewer>
