<script lang="ts" module>
  const TOOLS = [
    { id: 'pointer', label: 'Select text' },
    { id: 'pan', label: 'Scroll with the hand' },
  ];
</script>

<!-- A menu with a submenu: opening the submenu leaves its menu open. -->
<script lang="ts">
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useShell, useShellState } from '@embedpdf/svelte/shell';

  const shell = useShell();
  const interaction = useInteraction();
  const shellState = useShellState();
  const tools = useInteractionState();
  let bar: HTMLDivElement | undefined = $state();
  const openMenus = $derived(shellState.openMenus);
  const anyOpen = $derived(openMenus.length > 0);

  // A press outside the menus, or Escape, closes all of them.
  $effect(() => {
    if (!anyOpen) return;
    const outside = (event: PointerEvent) => {
      if (!bar?.contains(event.target as Node)) shell.closeAllMenus();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') shell.closeAllMenus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  });
</script>

<div class="toolbar">
  <div class="menubar" bind:this={bar}>
    <button
      type="button"
      class="button"
      aria-haspopup="menu"
      aria-expanded={openMenus.includes('view')}
      onclick={() => shell.toggleMenu('view')}
    >
      View ▾
    </button>
    {#if openMenus.includes('view')}
      <div class="menu" role="menu">
        <button
          type="button"
          role="menuitem"
          class="menu-item"
          aria-haspopup="menu"
          aria-expanded={openMenus.includes('view-tool')}
          onclick={() => shell.toggleMenu('view-tool')}
        >
          Tool <span aria-hidden="true">▸</span>
        </button>
        <button
          type="button"
          role="menuitem"
          class="menu-item"
          onclick={() => shell.closeAllMenus()}
        >
          Close menus
        </button>
        {#if openMenus.includes('view-tool')}
          <div class="menu submenu" role="menu">
            {#each TOOLS as tool (tool.id)}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={tool.id === tools.activeToolId}
                class="menu-item"
                onclick={() => {
                  interaction.activateTool(tool.id);
                  shell.closeAllMenus();
                }}
              >
                {tool.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <output class="readout">Open menus: {anyOpen ? openMenus.join(' › ') : 'none'}</output>
</div>
