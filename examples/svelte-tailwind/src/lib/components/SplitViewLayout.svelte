<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    useAllViews,
    useViewManagerCapability,
    ViewContext,
  } from '@embedpdf/plugin-view-manager/svelte';
  import type { ViewContextRenderProps } from '@embedpdf/plugin-view-manager/svelte';

  interface SplitViewLayoutProps {
    renderView: Snippet<[{ context: ViewContextRenderProps }]>;
  }

  let { renderView }: SplitViewLayoutProps = $props();

  const allViews = useAllViews();
  const capability = useViewManagerCapability();

  // Auto-remove empty views (except if it's the only view)
  $effect(() => {
    if (!capability.provides) return;

    const views = allViews.current;
    const emptyViews = views.filter((v) => v.documentIds.length === 0);

    if (emptyViews.length > 0 && views.length > 1) {
      emptyViews.forEach((emptyView) => {
        if (views.length > 1) {
          capability.provides?.removeView(emptyView.id);
        }
      });
    }
  });

  const getLayoutClass = $derived.by(() => {
    const viewCount = allViews.current.length;
    switch (viewCount) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
      case 4:
        return 'grid-cols-2 grid-rows-2';
      default:
        return 'grid-cols-3';
    }
  });
</script>

<div class="grid h-full gap-1 p-1 {getLayoutClass}">
  {#each allViews.current as view (view.id)}
    <ViewContext viewId={view.id}>
      {#snippet children(context)}
        <div
          onclick={context.focus}
          class="relative overflow-hidden border {context.isFocused
            ? 'border-blue-500'
            : 'border-gray-300'}"
        >
          {@render renderView({ context })}
        </div>
      {/snippet}
    </ViewContext>
  {/each}
</div>
