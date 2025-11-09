<script lang="ts">
  import { useSearch } from '@embedpdf/plugin-search/svelte';
  import { useScrollCapability } from '@embedpdf/plugin-scroll/svelte';
  import { MatchFlag } from '@embedpdf/models';
  import type { SearchResult } from '@embedpdf/models';
  import { tick } from 'svelte';

  interface SearchProps {
    documentId: string;
  }

  let { documentId }: SearchProps = $props();

  const search = useSearch(() => documentId);
  const scrollCapability = useScrollCapability();

  let inputValue = $state(search.state.query || '');
  let inputRef: HTMLInputElement | undefined;

  // Focus input when component mounts
  $effect(() => {
    tick().then(() => {
      inputRef?.focus();
      inputValue = search.state.query || '';
    });
  });

  // Watch for input changes and trigger search
  $effect(() => {
    if (inputValue === '') {
      search.provides?.stopSearch();
    } else {
      search.provides?.searchAllPages(inputValue);
    }
  });

  // Auto-scroll to active result when it changes
  $effect(() => {
    if (
      typeof search.state.activeResultIndex === 'number' &&
      !search.state.loading &&
      search.state.results.length > 0
    ) {
      scrollToItem(search.state.activeResultIndex);
    }
  });

  const handleFlagChange = (flag: MatchFlag, checked: boolean) => {
    const currentFlags = search.state.flags;
    if (checked) {
      search.provides?.setFlags([...currentFlags, flag]);
    } else {
      search.provides?.setFlags(currentFlags.filter((f) => f !== flag));
    }
  };

  const clearInput = () => {
    inputValue = '';
    inputRef?.focus();
  };

  const scrollToItem = (index: number) => {
    const item = search.state.results[index];
    if (!item) return;

    const minCoordinates = item.rects.reduce(
      (min, rect) => ({
        x: Math.min(min.x, rect.origin.x),
        y: Math.min(min.y, rect.origin.y),
      }),
      { x: Infinity, y: Infinity },
    );

    scrollCapability.provides?.scrollToPage({
      pageNumber: item.pageIndex + 1,
      pageCoordinates: minCoordinates,
      center: true,
    });
  };

  const groupByPage = (results: SearchResult[]) => {
    return results.reduce<Record<number, { hit: SearchResult; index: number }[]>>((map, r, i) => {
      (map[r.pageIndex] ??= []).push({ hit: r, index: i });
      return map;
    }, {});
  };

  const grouped = $derived(groupByPage(search.state.results));

  const handleHitClick = (index: number) => {
    search.provides?.goToResult(index);
  };

  const isMatchCaseChecked = $derived(search.state.flags.includes(MatchFlag.MatchCase));
  const isWholeWordChecked = $derived(search.state.flags.includes(MatchFlag.MatchWholeWord));
</script>

<div class="flex h-full flex-col bg-white">
  <!-- Search Input -->
  <div class="p-3">
    <div class="relative">
      <input
        bind:this={inputRef}
        bind:value={inputValue}
        type="text"
        placeholder="Search"
        class="w-full rounded border border-gray-300 py-2 pl-9 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <svg
        class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      {#if inputValue}
        <button
          onclick={clearInput}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          <svg
            class="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      {/if}
    </div>

    <!-- Search Options -->
    <div class="mt-3 space-y-2">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isMatchCaseChecked}
          onchange={(e) => handleFlagChange(MatchFlag.MatchCase, e.currentTarget.checked)}
          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span class="text-sm text-gray-700">Case sensitive</span>
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isWholeWordChecked}
          onchange={(e) => handleFlagChange(MatchFlag.MatchWholeWord, e.currentTarget.checked)}
          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span class="text-sm text-gray-700">Whole word</span>
      </label>
    </div>

    <div class="my-3 border-t border-gray-200"></div>

    <!-- Results Summary -->
    {#if search.state.active && !search.state.loading}
      <div class="flex items-center justify-between">
        <span class="text-sm text-blue-600">
          {search.state.total} result{search.state.total !== 1 ? 's' : ''} found
        </span>
        {#if search.state.total > 1}
          <div class="flex gap-1">
            <button
              onclick={() => search.provides?.previousResult()}
              class="rounded p-1 text-gray-600 hover:bg-gray-100"
              title="Previous result"
            >
              <svg
                class="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </button>
            <button
              onclick={() => search.provides?.nextResult()}
              class="rounded p-1 text-gray-600 hover:bg-gray-100"
              title="Next result"
            >
              <svg
                class="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Results List -->
  <div class="flex-1 overflow-y-auto px-3 pb-3">
    {#if search.state.loading}
      <div class="flex h-full items-center justify-center">
        <svg
          class="h-6 w-6 animate-spin text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    {:else}
      {#each Object.entries(grouped) as [page, hits]}
        <div class="mb-4">
          <div class="mb-2 text-xs font-medium text-gray-500">Page {Number(page) + 1}</div>

          <div class="space-y-2">
            {#each hits as { hit, index }}
              <button
                onclick={() => handleHitClick(index)}
                class="w-full cursor-pointer rounded border p-3 text-left text-sm transition-all hover:-translate-y-0.5 {index ===
                search.state.activeResultIndex
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'}"
              >
                <div class="text-gray-700">
                  {#if hit.context.truncatedLeft}
                    <span>… </span>
                  {/if}
                  <span>{hit.context.before}</span>
                  <span class="font-bold text-blue-600">{hit.context.match}</span>
                  <span>{hit.context.after}</span>
                  {#if hit.context.truncatedRight}
                    <span> …</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
