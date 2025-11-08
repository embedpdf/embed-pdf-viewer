<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ThumbMeta, WindowState } from '@embedpdf/plugin-thumbnail';
  import { useThumbnailPlugin } from '../hooks';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    children: Snippet<[ThumbMeta]>;
  }

  const { children, ...divProps }: Props = $props();

  const thumbnailPlugin = useThumbnailPlugin();

  let viewportRef: HTMLDivElement | undefined;
  let window = $state<WindowState | null>(null);

  // 1) subscribe once to window updates
  $effect(() => {
    if (!thumbnailPlugin.plugin) return;
    return thumbnailPlugin.plugin.onWindow((newWindow) => {
      window = newWindow;
    });
  });

  // 2) keep plugin in sync while the user scrolls
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin) return;

    const onScroll = () => {
      thumbnailPlugin.plugin.updateWindow(vp.scrollTop, vp.clientHeight);
    };

    vp.addEventListener('scroll', onScroll);
    return () => vp.removeEventListener('scroll', onScroll);
  });

  // 2.5) keep plugin in sync when viewport resizes (e.g., menu opens/closes)
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin) return;

    const resizeObserver = new ResizeObserver(() => {
      thumbnailPlugin.plugin.updateWindow(vp.scrollTop, vp.clientHeight);
    });

    resizeObserver.observe(vp);
    return () => resizeObserver.disconnect();
  });

  // 3) kick-start after document change
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin || !window) return;

    // push initial metrics
    thumbnailPlugin.plugin.updateWindow(vp.scrollTop, vp.clientHeight);
  });

  // 4) let plugin drive scroll – only after window is set, and only once
  $effect(() => {
    const vp = viewportRef;
    if (!vp || !thumbnailPlugin.plugin || !window) return;

    return thumbnailPlugin.plugin.onScrollTo(({ top, behavior }) => {
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
