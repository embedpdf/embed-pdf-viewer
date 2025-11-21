<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ThumbMeta, WindowState } from '@embedpdf/plugin-thumbnail';
  import { useThumbnailPlugin } from '../hooks';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    /**
     * The ID of the document that this thumbnail pane displays
     */
    documentId: string;
    children: Snippet<[ThumbMeta]>;
  }

  const { documentId, children, ...divProps }: Props = $props();

  const thumbnailPlugin = useThumbnailPlugin();

  let viewportRef: HTMLDivElement | undefined;

  // Store window data along with the documentId it came from
  let windowData = $state<{
    window: WindowState | null;
    docId: string | null;
  }>({ window: null, docId: null });

  // Only use the window if it matches the current documentId
  const window = $derived(windowData.docId === documentId ? windowData.window : null);

  // 1) subscribe to window updates for this document
  $effect(() => {
    if (!thumbnailPlugin.plugin) {
      windowData = { window: null, docId: null };
      return;
    }

    const scope = thumbnailPlugin.plugin.provides().forDocument(documentId);

    // Get initial window state immediately on mount
    const initialWindow = scope.getWindow();
    if (initialWindow) {
      windowData = { window: initialWindow, docId: documentId };
    }

    // Subscribe to future updates
    const unsubscribe = scope.onWindow((newWindow) => {
      windowData = { window: newWindow, docId: documentId };
    });

    // Clear state when documentId changes or component unmounts
    return () => {
      unsubscribe();
      windowData = { window: null, docId: null };
    };
  });

  // 2) keep plugin in sync while the user scrolls
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin) return;

    const scope = thumbnailPlugin.plugin.provides().forDocument(documentId);
    const onScroll = () => {
      scope.updateWindow(vp.scrollTop, vp.clientHeight);
    };

    vp.addEventListener('scroll', onScroll);
    return () => vp.removeEventListener('scroll', onScroll);
  });

  // 2.5) keep plugin in sync when viewport resizes (e.g., menu opens/closes)
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin) return;

    const scope = thumbnailPlugin.plugin.provides().forDocument(documentId);
    const resizeObserver = new ResizeObserver(() => {
      scope.updateWindow(vp.scrollTop, vp.clientHeight);
    });

    resizeObserver.observe(vp);
    return () => resizeObserver.disconnect();
  });

  // 3) kick-start after document change
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin || !window) return;

    const scope = thumbnailPlugin.plugin.provides().forDocument(documentId);
    // push initial metrics
    scope.updateWindow(vp.scrollTop, vp.clientHeight);
  });

  // 4) let plugin drive scroll – only after window is set, and only once
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin || !window) return;

    const scope = thumbnailPlugin.plugin.provides().forDocument(documentId);
    return scope.onScrollTo(({ top, behavior }) => {
      vp.scrollTo({ top, behavior });
    });
  });

  const paddingY = $derived(thumbnailPlugin?.plugin?.cfg.paddingY ?? 0);
  const totalHeight = $derived(window?.totalHeight ?? 0);
  const items = $derived(window?.items ?? []);
</script>

<div
  bind:this={viewportRef}
  style:overflow-y="auto"
  style:position="relative"
  style:padding-top="{paddingY}px"
  style:padding-bottom="{paddingY}px"
  style:height="100%"
  {...divProps}
>
  <div style:height="{totalHeight}px" style:position="relative">
    {#each items as meta (meta.pageIndex)}
      {@render children(meta)}
    {/each}
  </div>
</div>
