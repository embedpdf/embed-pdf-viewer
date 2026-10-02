<!--
  The search matches on one page, the selection layer's twin: it reads the page's matches in page
  space from the plugin and maps them through the page's transform, in the colors of the plugin's
  `highlight` setting, which the `--epdf-search-*` CSS variables win over. It calls no engine:
  searching is app chrome's, through `useSearch()`.
-->
<script lang="ts">
  import type { SearchHit } from '@embedpdf/plugin-search';
  import { createClickDetector, paint, searchHighlightsOf } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import type { SearchLayerProps } from './props';
  import { useSearchHits, useSearchSettings, useSearchState } from './readers.svelte';

  let { onHitClick }: SearchLayerProps = $props();

  const page = usePage();
  // The plugin keeps a page's list until matches land on it, so this redraws only then.
  const hits = useSearchHits(() => page.ref);
  // The record form: `activeHit` passes on only when it is another match (compared by identity).
  const search = useSearchState();
  const highlight = useSearchSettings((settings) => settings.highlight);
  // Tells a click on a match from a drag that starts there (and selects text).
  const clicks = createClickDetector();

  // Each color is its CSS variable first, then the setting: CSS wins.
  const color = $derived(paint('search-highlight', highlight.current.color));
  const activeColor = $derived(paint('search-highlight-active', highlight.current.activeColor));
  const blendMode = $derived(paint('search-blend-mode', highlight.current.blendMode));
  // One piece per line of each match: a rounded box when upright, its true quad when turned.
  const pieces = $derived(
    searchHighlightsOf(hits.current, {
      active: search.activeHit,
      page: page.transform,
      color,
      activeColor,
    }),
  );

  // Nothing here stops the press, so it reaches the page as well: a drag that starts on a match
  // selects text, and only a click counts.
  const press = (event: PointerEvent) => clicks.press(event);
  const click = (hit: SearchHit, event: MouseEvent) => {
    if (clicks.isClick(event)) onHitClick?.(hit);
  };
</script>

{#if hits.current.length > 0}
  <div style="position: absolute; inset: 0; pointer-events: none">
    <!-- Only a clickable match takes the pointer; a plain highlight stays inert. A match isn't a
         control of its own: the keyboard moves between matches with the search's next and
         previous. -->
    {#each pieces as piece (piece.key)}
      {#if piece.box}
        <!-- An upright line is a rounded box. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          style:position="absolute"
          style:left="{piece.box.left}px"
          style:top="{piece.box.top}px"
          style:width="{piece.box.width}px"
          style:height="{piece.box.height}px"
          style:background-color={piece.fill}
          style:mix-blend-mode={blendMode}
          style:border-radius="2px"
          style:pointer-events={onHitClick ? 'auto' : undefined}
          style:cursor={onHitClick ? 'pointer' : undefined}
          onpointerdown={onHitClick ? press : undefined}
          onclick={onHitClick ? (event) => click(piece.hit, event) : undefined}
        ></div>
      {:else}
        <!-- A turned line draws its true quad. -->
        <svg
          style:position="absolute"
          style:inset="0"
          style:width="100%"
          style:height="100%"
          style:overflow="visible"
          style:mix-blend-mode={blendMode}
        >
          <!-- The fill is in `style`: an SVG attribute doesn't read var(). -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <polygon
            points={piece.points}
            style:fill={piece.fill}
            style:pointer-events={onHitClick ? 'auto' : undefined}
            style:cursor={onHitClick ? 'pointer' : undefined}
            onpointerdown={onHitClick ? press : undefined}
            onclick={onHitClick ? (event) => click(piece.hit, event) : undefined}
          />
        </svg>
      {/if}
    {/each}
  </div>
{/if}
