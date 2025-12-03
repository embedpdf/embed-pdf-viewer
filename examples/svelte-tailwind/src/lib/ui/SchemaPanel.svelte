<script lang="ts">
  import {
    type PanelRendererProps,
    useUICapability,
    useUIState,
    useItemRenderer,
  } from '@embedpdf/plugin-ui/svelte';
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import { onMount } from 'svelte';
  import { CloseIcon } from '../components/icons';

  type BottomSheetHeight = 'half' | 'full';

  interface Props extends PanelRendererProps {}

  let { schema, documentId, isOpen, onClose }: Props = $props();

  const { provides } = useUICapability();
  const uiState = useUIState(() => documentId);
  const { translate } = useTranslations(() => documentId);
  const { getCustomComponent: renderCustomComponent } = useItemRenderer();

  const scope = $derived(provides ? provides.forDocument(documentId) : null);

  // Mobile detection - initialize immediately to prevent flash
  let isMobile = $state(typeof window !== 'undefined' && window.innerWidth < 768);

  // Bottom sheet state for mobile
  let sheetHeight = $state<BottomSheetHeight>('half');
  let isDragging = $state(false);
  let startY = $state(0);
  let currentY = $state(0);

  // Panel ref for gestures
  let panelRef: HTMLDivElement | null = $state(null);

  // Local active tab
  let localActiveTabId = $state<string | null>(null);

  // Resolved active tab
  const resolvedActiveTabId = $derived.by(() => {
    if (schema.content.type !== 'tabs') return null;
    const availableTabs = schema.content.tabs ?? [];
    const stateActive = uiState?.state?.panelTabs?.[schema.id];
    if (stateActive) return stateActive;
    const scopeActive = scope?.getPanelTab?.(schema.id);
    if (scopeActive) return scopeActive;
    return stateActive ?? schema.content.defaultTab ?? availableTabs[0]?.id ?? null;
  });

  const activeTabId = $derived(localActiveTabId ?? resolvedActiveTabId);

  const activeTab = $derived.by(() => {
    if (schema.content.type !== 'tabs') return null;
    const availableTabs = schema.content.tabs ?? [];
    return (
      availableTabs.find((tab) => tab.id === activeTabId) ??
      availableTabs.find((tab) => tab.id === resolvedActiveTabId) ??
      availableTabs[0]
    );
  });

  // Reset local tab when resolved changes
  $effect(() => {
    if (localActiveTabId !== null && resolvedActiveTabId === localActiveTabId) {
      localActiveTabId = null;
    }
  });

  function handleTabSelect(tabId: string) {
    if (tabId === activeTabId) return;
    localActiveTabId = tabId;

    if (scope) {
      scope.setPanelTab(schema.id, tabId);
    }
  }

  // Swipe gesture handlers
  function handleTouchStart(e: TouchEvent) {
    if (!e.touches[0]) return;
    isDragging = true;
    startY = e.touches[0].clientY;
    currentY = e.touches[0].clientY;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isDragging || !e.touches[0]) return;
    currentY = e.touches[0].clientY;
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;

    const deltaY = currentY - startY;
    const threshold = 100;

    if (deltaY > threshold) {
      // Swiped down
      if (sheetHeight === 'full') {
        sheetHeight = 'half';
      } else {
        onClose?.();
      }
    } else if (deltaY < -threshold) {
      // Swiped up
      if (sheetHeight === 'half') {
        sheetHeight = 'full';
      }
    }

    startY = 0;
    currentY = 0;
  }

  function handleMouseDown(e: MouseEvent) {
    isDragging = true;
    startY = e.clientY;
    currentY = e.clientY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    currentY = e.clientY;
  }

  function handleMouseUp() {
    if (!isDragging) return;
    isDragging = false;

    const deltaY = currentY - startY;
    const threshold = 100;

    if (deltaY > threshold) {
      if (sheetHeight === 'full') {
        sheetHeight = 'half';
      } else {
        onClose?.();
      }
    } else if (deltaY < -threshold) {
      if (sheetHeight === 'half') {
        sheetHeight = 'full';
      }
    }

    startY = 0;
    currentY = 0;
  }

  onMount(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  });

  // Mouse event listeners
  $effect(() => {
    if (isDragging) {
      const handleMove = (e: MouseEvent) => handleMouseMove(e);
      const handleUp = () => handleMouseUp();

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);

      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };
    }
  });

  function getPositionClasses(placement: 'left' | 'right' | 'top' | 'bottom'): string {
    switch (placement) {
      case 'left':
        return 'h-full border-r border-gray-300 bg-white';
      case 'right':
        return 'h-full border-l border-gray-300 bg-white';
      case 'top':
        return 'w-full border-b border-gray-300 bg-white';
      case 'bottom':
        return 'w-full border-t border-gray-300 bg-white';
      default:
        return 'h-full bg-white';
    }
  }

  const positionClasses = $derived(getPositionClasses(schema.position?.placement ?? 'left'));
  const widthStyle = $derived(schema.width ? `width: ${schema.width}` : undefined);
</script>

{#if isOpen}
  {#if schema.type !== 'sidebar'}
    <div>Unsupported panel type: {schema.type}</div>
  {:else if isMobile}
    {@const heightClass = sheetHeight === 'full' ? 'h-[100vh]' : 'h-[50vh]'}
    {@const dragOffset = isDragging ? Math.max(0, currentY - startY) : 0}

    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
      onclick={onClose}
      role="button"
      tabindex="-1"
    />

    <!-- Bottom Sheet -->
    <div
      bind:this={panelRef}
      class={`fixed bottom-0 left-0 right-0 z-50 ${heightClass} flex flex-col rounded-t-2xl bg-white shadow-2xl transition-all duration-300`}
      style:transform={`translateY(${dragOffset}px)`}
      data-panel-id={schema.id}
    >
      <!-- Drag Handle & Header -->
      <div
        class="flex cursor-grab items-center justify-between border-b border-gray-200 px-4 py-3 active:cursor-grabbing"
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        onmousedown={handleMouseDown}
        role="button"
        tabindex="-1"
      >
        <div class="flex flex-1 justify-center">
          <div class="h-1.5 w-12 rounded-full bg-gray-300" />
        </div>
        <button
          onclick={onClose}
          class="ml-2 rounded-full p-1 transition-colors hover:bg-gray-100"
          aria-label="Close panel"
        >
          <CloseIcon class="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {#if schema.content.type === 'tabs'}
        {@const availableTabs = schema.content.tabs ?? []}

        <!-- Tabs -->
        <div class="flex gap-2 border-b border-gray-200 bg-gray-50 p-2">
          {#each availableTabs as tab (tab.id)}
            {@const isActive = tab.id === (activeTab?.id ?? activeTabId)}
            <button
              type="button"
              class={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
              onclick={() => handleTabSelect(tab.id)}
              role="tab"
              aria-selected={isActive}
            >
              {translate(tab.labelKey || tab.id, { fallback: tab.label || tab.id })}
            </button>
          {/each}
        </div>

        <!-- Content -->
        {#if activeTab?.componentId}
          {@const Component = renderCustomComponent(activeTab.componentId)}
          <div class="flex-1 overflow-auto">
            {#if Component}
              <Component {documentId} tabId={activeTab.id} {onClose} />
            {/if}
          </div>
        {/if}
      {:else if schema.content.type === 'component'}
        <!-- Content -->
        {#if schema.content.componentId}
          {@const Component = renderCustomComponent(schema.content.componentId)}
          <div class="flex-1 overflow-auto">
            {#if Component}
              <Component {documentId} {onClose} />
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <!-- Desktop rendering -->
    {#if schema.content.type === 'tabs'}
      {@const availableTabs = schema.content.tabs ?? []}

      <div
        class={`${positionClasses} flex h-full flex-col`}
        style={widthStyle}
        data-panel-id={schema.id}
      >
        <div class="flex gap-2 border-b border-gray-200 bg-gray-50 p-2">
          {#each availableTabs as tab (tab.id)}
            {@const isActive = tab.id === (activeTab?.id ?? activeTabId)}
            <button
              type="button"
              class={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
              onclick={() => handleTabSelect(tab.id)}
              role="tab"
              aria-selected={isActive}
            >
              {translate(tab.labelKey || tab.id, { fallback: tab.label || tab.id })}
            </button>
          {/each}
        </div>

        {#if activeTab?.componentId}
          {@const Component = renderCustomComponent(activeTab.componentId)}
          <div class="flex-1 overflow-auto">
            {#if Component}
              <Component {documentId} tabId={activeTab.id} {onClose} />
            {/if}
          </div>
        {/if}
      </div>
    {:else if schema.content.type === 'component'}
      {#if schema.content.componentId}
        {@const Component = renderCustomComponent(schema.content.componentId)}
        <div class={`${positionClasses} h-full`} style={widthStyle} data-panel-id={schema.id}>
          {#if Component}
            <Component {documentId} {onClose} />
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
{/if}
