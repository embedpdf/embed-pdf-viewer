<script lang="ts">
  import { useViewportCapability } from '@embedpdf/plugin-viewport/svelte';
  import { useScroll } from '@embedpdf/plugin-scroll/svelte';

  const viewport = useViewportCapability();
  const scroll = useScroll();

  let isVisible = $state(false);
  let isHovering = $state(false);
  let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let inputValue = $state('1');

  // Update input when current page changes
  $effect(() => {
    inputValue = scroll.state.currentPage.toString();
  });

  const startHideTimer = () => {
    if (hideTimeoutId) {
      clearTimeout(hideTimeoutId);
    }
    hideTimeoutId = setTimeout(() => {
      if (!isHovering) {
        isVisible = false;
      }
    }, 4000);
  };

  // Watch for scroll activity
  $effect(() => {
    if (!viewport.provides) return;

    const unsubscribe = viewport.provides.onScrollActivity((activity) => {
      if (activity) {
        isVisible = true;
        startHideTimer();
      }
    });

    return () => {
      if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
      }
      unsubscribe?.();
    };
  });

  const handleMouseEnter = () => {
    isHovering = true;
    isVisible = true;
  };

  const handleMouseLeave = () => {
    isHovering = false;
    startHideTimer();
  };

  const handlePageSubmit = (e: Event) => {
    e.preventDefault();
    const page = parseInt(inputValue);

    if (!isNaN(page) && page >= 1 && page <= scroll.state.totalPages) {
      scroll.provides?.scrollToPage?.({
        pageNumber: page,
      });
    }
  };

  const handlePreviousPage = () => {
    if (scroll.state.currentPage > 1) {
      scroll.provides?.scrollToPage?.({
        pageNumber: scroll.state.currentPage - 1,
      });
    }
  };

  const handleNextPage = () => {
    if (scroll.state.currentPage < scroll.state.totalPages) {
      scroll.provides?.scrollToPage?.({
        pageNumber: scroll.state.currentPage + 1,
      });
    }
  };

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = target.value.replace(/[^0-9]/g, '');
    inputValue = value;
  };
</script>

<div
  role="toolbar"
  aria-label="Page navigation"
  tabindex="-1"
  class="pointer-events-auto fixed bottom-4 left-1/2 z-[1000] -translate-x-1/2 transition-opacity duration-200 ease-in-out"
  style="opacity: {isVisible ? 1 : 0}"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <div class="flex items-center gap-2 rounded border border-gray-300 bg-gray-50 p-1 shadow-md">
    <!-- Previous Page Button -->
    <button
      class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
      onclick={handlePreviousPage}
      disabled={scroll.state.currentPage === 1}
      title="Previous Page"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M15 6l-6 6l6 6" />
      </svg>
    </button>

    <!-- Page Input Form -->
    <form onsubmit={handlePageSubmit} class="flex items-center gap-2">
      <input
        type="text"
        name="page"
        value={inputValue}
        oninput={handleInputChange}
        class="h-7 w-12 rounded border border-gray-300 bg-white px-1 text-center text-sm focus:border-gray-400 focus:outline-none"
      />
      <span class="text-sm text-gray-600">/ {scroll.state.totalPages}</span>
    </form>

    <!-- Next Page Button -->
    <button
      class="flex h-8 w-8 items-center justify-center text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
      onclick={handleNextPage}
      disabled={scroll.state.currentPage === scroll.state.totalPages}
      title="Next Page"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M9 6l6 6l-6 6" />
      </svg>
    </button>
  </div>
</div>
