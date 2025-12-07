<script lang="ts">
  import {
    type MenuRendererProps,
    type MenuItem,
    useUISchema,
    type MenuSchema,
    getUIItemProps,
  } from '@embedpdf/plugin-ui/svelte';
  import { useCommand } from '@embedpdf/plugin-commands/svelte';
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import { onMount } from 'svelte';
  import Icons from '../components/Icons.svelte';
  import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from '../components/icons';

  interface Props extends MenuRendererProps {}

  let { schema, documentId, anchorEl, onClose }: Props = $props();

  const uiSchema = useUISchema();
  const translations = useTranslations(() => documentId);

  interface MenuStackItem {
    menuId: string;
    schema: MenuSchema;
    title?: string;
  }

  // Navigation stack for mobile submenus
  let menuStack = $state<MenuStackItem[]>([{ menuId: schema.id, schema, title: undefined }]);

  // Reset stack when schema changes
  $effect(() => {
    menuStack = [{ menuId: schema.id, schema, title: undefined }];
  });

  const currentMenu = $derived(menuStack[menuStack.length - 1]);

  function navigateToSubmenu(submenuId: string, title: string) {
    if (!uiSchema?.schema) return;
    const submenuSchema = uiSchema.schema.menus[submenuId];
    if (!submenuSchema) {
      console.warn(`Submenu schema not found: ${submenuId}`);
      return;
    }
    menuStack = [...menuStack, { menuId: submenuId, schema: submenuSchema, title }];
  }

  function navigateBack() {
    if (menuStack.length > 1) {
      menuStack = menuStack.slice(0, -1);
    }
  }

  // Detect mobile/desktop
  let isMobile = $state(false);

  onMount(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  });

  // Calculate menu position relative to anchor
  let menuRef: HTMLDivElement | null = $state(null);
  let position = $state<{ top: number; left: number } | null>(null);

  $effect(() => {
    if (!anchorEl || isMobile) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = menuRef?.offsetWidth || 200;

      let top = rect.bottom + 4;
      let left = rect.left;

      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) {
        left = 8;
      }

      position = { top, left };
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  });

  // Close on outside click
  $effect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef &&
        !menuRef.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  });

  // Close on escape key
  onMount(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  });
</script>

{#if currentMenu}
  {#if isMobile}
    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
      onclick={onClose}
      role="button"
      tabindex="-1"
    ></div>

    <!-- Bottom Sheet -->
    <div
      bind:this={menuRef}
      {...getUIItemProps(currentMenu.schema)}
      class="animate-slide-up fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl"
      role="menu"
    >
      <!-- Header -->
      {#if menuStack.length > 1}
        <!-- Submenu header with back button -->
        <div class="flex items-center border-b border-gray-200 px-4 py-3">
          <button
            onclick={navigateBack}
            class="flex items-center gap-2 font-medium text-blue-600"
            aria-label="Go back"
          >
            <ChevronLeftIcon class="h-5 w-5" />
            <span>Back</span>
          </button>
          {#if currentMenu.title}
            <span class="ml-auto text-sm font-semibold text-gray-700">
              {currentMenu.title}
            </span>
          {/if}
        </div>
      {:else}
        <!-- Main menu handle bar -->
        <div class="flex justify-center py-3">
          <div class="h-1.5 w-12 rounded-full bg-gray-300"></div>
        </div>
      {/if}

      <div class="pb-safe px-2">
        {#each currentMenu.schema.items as item, index (item.type + '-' + index)}
          {@render MenuItemRenderer({
            item,
            documentId,
            onClose,
            isMobile,
            onNavigateToSubmenu: navigateToSubmenu,
          })}
        {/each}
      </div>
    </div>
  {:else}
    <!-- Desktop dropdown -->
    <div
      bind:this={menuRef}
      {...getUIItemProps(currentMenu.schema)}
      class="animate-fade-in fixed z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white shadow-lg"
      style:top={position ? `${position.top}px` : undefined}
      style:left={position ? `${position.left}px` : undefined}
      role="menu"
    >
      <!-- Header for submenus -->
      {#if menuStack.length > 1}
        <div class="flex items-center rounded-t-lg border-b border-gray-200 bg-gray-50 px-2 py-2">
          <button
            onclick={navigateBack}
            class="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            aria-label="Go back"
          >
            <ChevronLeftIcon class="h-4 w-4" />
            <span>Back</span>
          </button>
          {#if currentMenu.title}
            <span class="ml-auto text-xs font-semibold text-gray-600">{currentMenu.title}</span>
          {/if}
        </div>
      {/if}

      <!-- Menu items -->
      <div class="py-1">
        {#each currentMenu.schema.items as item, index (item.type + '-' + index)}
          {@render MenuItemRenderer({
            item,
            documentId,
            onClose,
            isMobile: false,
            onNavigateToSubmenu: navigateToSubmenu,
          })}
        {/each}
      </div>
    </div>
  {/if}
{/if}

<!-- ─────────────────────────────────────────────────────────
     Menu Item Renderer Component
     ───────────────────────────────────────────────────────── -->
{#snippet MenuItemRenderer({
  item,
  documentId,
  onClose,
  isMobile,
  onNavigateToSubmenu,
}: {
  item: MenuItem;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
})}
  {#if item.type === 'command'}
    {@render CommandMenuItem({ item, documentId, onClose, isMobile })}
  {:else if item.type === 'submenu'}
    {@render SubmenuItem({ item, documentId, isMobile, onNavigateToSubmenu })}
  {:else if item.type === 'divider'}
    {@render MenuDivider({ item, isMobile })}
  {:else if item.type === 'section'}
    {@render MenuSection({
      item,
      documentId,
      onClose,
      isMobile,
      onNavigateToSubmenu,
    })}
  {/if}
{/snippet}

<!-- ─────────────────────────────────────────────────────────
     Command Menu Item Component
     ───────────────────────────────────────────────────────── -->
{#snippet CommandMenuItem({
  item,
  documentId,
  onClose,
  isMobile,
}: {
  item: Extract<MenuItem, { type: 'command' }>;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
})}
  {@const command = useCommand(
    () => item.commandId,
    () => documentId,
  )}

  {#if command?.current?.visible}
    {@const baseClasses = isMobile
      ? 'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100'
      : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-100'}
    {@const disabledClasses = command.current?.disabled
      ? 'opacity-50 cursor-not-allowed'
      : 'cursor-pointer'}
    {@const activeClasses = command.current?.active ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}
    {@const iconProps = command.current?.iconProps || {}}

    <button
      {...getUIItemProps(item)}
      onclick={() => {
        if (!command.current?.disabled) {
          command.current?.execute();
          onClose();
        }
      }}
      disabled={command.current?.disabled}
      class={`${baseClasses} ${disabledClasses} ${activeClasses} w-full text-left`}
      role="menuitem"
    >
      {#if command.current?.icon}
        <Icons
          name={command.current.icon}
          class={isMobile ? 'h-5 w-5' : 'h-4 w-4'}
          primaryColor={iconProps.primaryColor}
          secondaryColor={iconProps.secondaryColor}
        />
      {/if}
      <span class="flex-1">{command.current?.label}</span>
      {#if command.current?.active}
        <CheckIcon class="h-4 w-4" />
      {/if}
      {#if command.current?.shortcuts && command.current?.shortcuts.length > 0 && !isMobile}
        <span class="text-xs text-gray-400">{command.current?.shortcuts[0]}</span>
      {/if}
    </button>
  {/if}
{/snippet}

<!-- ─────────────────────────────────────────────────────────
     Submenu Item Component
     ───────────────────────────────────────────────────────── -->
{#snippet SubmenuItem({
  item,
  documentId,
  isMobile,
  onNavigateToSubmenu,
}: {
  item: Extract<MenuItem, { type: 'submenu' }>;
  documentId: string;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
})}
  {@const baseClasses = isMobile
    ? 'flex items-center gap-3 px-4 py-3 text-base transition-colors active:bg-gray-100'
    : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-100'}

  <button
    {...getUIItemProps(item)}
    onclick={() => {
      if (onNavigateToSubmenu) {
        onNavigateToSubmenu(
          item.menuId,
          translations.translate(item.labelKey || item.id, { fallback: item.label || item.id }),
        );
      }
    }}
    class={`${baseClasses} w-full cursor-pointer text-left text-gray-700`}
    role="menuitem"
  >
    {#if item.icon}
      <Icons name={item.icon} class={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
    {/if}
    <span class="flex-1">
      {translations.translate(item.labelKey || item.id, { fallback: item.label || item.id })}
    </span>
    <ChevronRightIcon class={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
  </button>
{/snippet}

<!-- ─────────────────────────────────────────────────────────
     Menu Divider Component
     ───────────────────────────────────────────────────────── -->
{#snippet MenuDivider({
  item,
  isMobile,
}: {
  item: Extract<MenuItem, { type: 'divider' }>;
  isMobile: boolean;
})}
  <div
    {...getUIItemProps(item)}
    class={isMobile ? 'my-2 border-t border-gray-200' : 'my-1 border-t border-gray-200'}
  ></div>
{/snippet}

<!-- ─────────────────────────────────────────────────────────
     Menu Section Component
     ───────────────────────────────────────────────────────── -->
{#snippet MenuSection({
  item,
  documentId,
  onClose,
  isMobile,
  onNavigateToSubmenu,
}: {
  item: Extract<MenuItem, { type: 'section' }>;
  documentId: string;
  onClose: () => void;
  isMobile: boolean;
  onNavigateToSubmenu?: (submenuId: string, title: string) => void;
})}
  <div {...getUIItemProps(item)} class={isMobile ? 'py-2' : 'py-1'}>
    {#if item.labelKey || item.label}
      <div
        class={isMobile
          ? 'px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500'
          : 'px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500'}
      >
        {translations.translate(item.labelKey || item.id, { fallback: item.label || item.id })}
      </div>
    {/if}
    {#each item.items as subItem, index (subItem.type + '-' + index)}
      {@render MenuItemRenderer({
        item: subItem,
        documentId,
        onClose,
        isMobile,
        onNavigateToSubmenu,
      })}
    {/each}
  </div>
{/snippet}
