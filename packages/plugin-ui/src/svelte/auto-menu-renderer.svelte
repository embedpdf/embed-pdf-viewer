<script lang="ts">
  import { useUIState, useUICapability } from './hooks/use-ui.svelte';
  import { useAnchorRegistry } from './registries/anchor-registry.svelte';
  import { useRenderers } from './registries/renderers-registry.svelte';

  /**
   * Automatically renders menus when opened
   *
   * This component:
   * 1. Listens to UI plugin state for open menus
   * 2. Looks up anchor elements from the anchor registry
   * 3. Renders menus using the user-provided menu renderer
   */

  interface Props {
    documentId: string; // Which document's menus to render
    container?: HTMLElement | null;
  }

  let { documentId, container = null }: Props = $props();

  const uiState = useUIState(() => documentId);
  const capability = useUICapability();
  const anchorRegistry = useAnchorRegistry();
  const renderers = useRenderers();

  // Derived state for active menu
  const activeMenu = $derived.by(() => {
    const openMenus = uiState.state?.openMenus || {};
    const openMenuIds = Object.keys(openMenus);

    if (openMenuIds.length === 0) return null;

    // Show the first open menu (in practice, should only be one)
    const menuId = openMenuIds[0];
    if (!menuId) return null;

    const menuState = openMenus[menuId];
    if (!menuState || !menuState.triggeredByItemId) return null;

    // Look up anchor with documentId scope
    const anchor = anchorRegistry.getAnchor(documentId, menuState.triggeredByItemId);
    return { menuId, anchorEl: anchor };
  });

  const schema = $derived(capability.provides?.getSchema());

  const menuSchema = $derived.by(() => {
    if (!activeMenu || !schema) return null;

    const menuSchemaValue = schema.menus[activeMenu.menuId];
    if (!menuSchemaValue) {
      console.warn(`Menu "${activeMenu.menuId}" not found in schema`);
      return null;
    }

    return menuSchemaValue;
  });

  const handleClose = () => {
    if (activeMenu) {
      uiState.provides?.closeMenu(activeMenu.menuId);
    }
  };

  // Use the user-provided menu renderer
  const MenuRenderer = renderers.menu;
</script>

{#if activeMenu && menuSchema && MenuRenderer}
  <MenuRenderer
    schema={menuSchema}
    {documentId}
    anchorEl={activeMenu.anchorEl}
    onClose={handleClose}
    {container}
  />
{/if}
