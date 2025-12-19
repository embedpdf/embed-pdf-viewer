<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { useScrollPlugin } from '../hooks';
  import { type ScrollerLayout, ScrollStrategy } from '@embedpdf/plugin-scroll';
  import type { PageLayout } from '@embedpdf/plugin-scroll';

  type ScrollerProps = HTMLAttributes<HTMLDivElement> & {
    documentId: string;
    renderPage: Snippet<[PageLayout]>;
  };

  let { documentId, renderPage, ...restProps }: ScrollerProps = $props();

  const { plugin: scrollPlugin } = useScrollPlugin();

  let layoutData = $state<{
    layout: ScrollerLayout | null;
    docId: string | null;
  }>({ layout: null, docId: null });

  $effect(() => {
    if (!scrollPlugin || !documentId) {
      layoutData = { layout: null, docId: null };
      return;
    }

    // When we get new data, store it along with the current documentId
    const unsubscribe = scrollPlugin.onScrollerData(documentId, (newLayout) => {
      layoutData = { layout: newLayout, docId: documentId };
    });

    // When the effect re-runs or component unmounts, clear the state
    return () => {
      unsubscribe();
      layoutData = { layout: null, docId: null };
      scrollPlugin.clearLayoutReady(documentId);
    };
  });

  // Only use layout if it matches the current documentId (prevents stale data)
  const scrollerLayout = $derived(layoutData.docId === documentId ? layoutData.layout : null);

  // Call setLayoutReady after layout is rendered (Svelte's equivalent to useLayoutEffect)
  $effect.pre(() => {
    if (!scrollPlugin || !documentId || !scrollerLayout) return;

    scrollPlugin.setLayoutReady(documentId);
  });
</script>

{#if scrollerLayout}
  <div
    {...restProps}
    style:width={`${scrollerLayout.totalWidth}px`}
    style:height={`${scrollerLayout.totalHeight}px`}
    style:position="relative"
    style:box-sizing="border-box"
    style:margin="0 auto"
    style:display={scrollerLayout.strategy === ScrollStrategy.Horizontal ? 'flex' : undefined}
    style:flex-direction={scrollerLayout.strategy === ScrollStrategy.Horizontal ? 'row' : undefined}
  >
    <!-- Leading spacer -->
    <div
      style:width={scrollerLayout.strategy === ScrollStrategy.Horizontal
        ? `${scrollerLayout.startSpacing}px`
        : '100%'}
      style:height={scrollerLayout.strategy === ScrollStrategy.Horizontal
        ? '100%'
        : `${scrollerLayout.startSpacing}px`}
      style:flex-shrink={scrollerLayout.strategy === ScrollStrategy.Horizontal ? '0' : undefined}
    ></div>

    <!-- Page grid -->
    <div
      style:gap={`${scrollerLayout.pageGap}px`}
      style:display="flex"
      style:align-items="center"
      style:position="relative"
      style:box-sizing="border-box"
      style:flex-direction={scrollerLayout.strategy === ScrollStrategy.Horizontal
        ? 'row'
        : 'column'}
      style:min-height={scrollerLayout.strategy === ScrollStrategy.Horizontal ? '100%' : undefined}
      style:min-width={scrollerLayout.strategy === ScrollStrategy.Horizontal
        ? undefined
        : 'fit-content'}
    >
      {#each scrollerLayout.items as item (item.pageNumbers[0])}
        <div
          style:display="flex"
          style:justify-content="center"
          style:gap={`${scrollerLayout.pageGap}px`}
        >
          {#each item.pageLayouts as layout (layout.pageNumber)}
            <div
              style:width={`${layout.rotatedWidth}px`}
              style:height={`${layout.rotatedHeight}px`}
            >
              {@render renderPage(layout)}
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <!-- Trailing spacer -->
    <div
      style:width={scrollerLayout.strategy === ScrollStrategy.Horizontal
        ? `${scrollerLayout.endSpacing}px`
        : '100%'}
      style:height={scrollerLayout.strategy === ScrollStrategy.Horizontal
        ? '100%'
        : `${scrollerLayout.endSpacing}px`}
      style:flex-shrink={scrollerLayout.strategy === ScrollStrategy.Horizontal ? '0' : undefined}
    ></div>
  </div>
{/if}
