<script lang="ts">
  import { useRotate, useRotateCapability } from '@embedpdf/plugin-rotate/svelte';
  import { useSpread } from '@embedpdf/plugin-spread/svelte';
  import { SpreadMode } from '@embedpdf/plugin-spread';
  import {
    SettingsIcon,
    RotateRightIcon,
    RotateLeftIcon,
    SinglePageIcon,
    BookOpenIcon,
  } from './icons';
  import {
    ToolbarButton,
    DropdownMenu,
    DropdownSection,
    DropdownItem,
    DropdownDivider,
  } from './ui';

  interface PageSettingsProps {
    documentId: string;
  }

  let { documentId }: PageSettingsProps = $props();

  const rotate = useRotate(() => documentId);
  const spread = useSpread(() => documentId);

  let isOpen = $state(false);

  const handleRotateForward = () => {
    rotate?.provides?.rotateForward();
    isOpen = false;
  };

  const handleRotateBackward = () => {
    rotate?.provides?.rotateBackward();
    isOpen = false;
  };

  const handleSpreadMode = (mode: SpreadMode) => {
    spread.provides?.setSpreadMode(mode);
    isOpen = false;
  };
</script>

{#if rotate?.provides && spread.provides}
  <div class="relative">
    <ToolbarButton
      onclick={() => (isOpen = !isOpen)}
      isActive={isOpen}
      aria-label="Page Settings"
      title="Page Settings"
    >
      <SettingsIcon class="h-4 w-4" />
    </ToolbarButton>

    <DropdownMenu {isOpen} onClose={() => (isOpen = false)} className="w-56">
      <DropdownSection title="Page Orientation">
        <DropdownItem onclick={handleRotateForward}>
          {#snippet icon()}
            <RotateRightIcon class="h-4 w-4" title="Rotate Clockwise" />
          {/snippet}
          Rotate Clockwise
        </DropdownItem>
        <DropdownItem onclick={handleRotateBackward}>
          {#snippet icon()}
            <RotateLeftIcon class="h-4 w-4" title="Rotate Counter-clockwise" />
          {/snippet}
          Rotate Counter-clockwise
        </DropdownItem>
      </DropdownSection>

      <DropdownDivider />

      <DropdownSection title="Page Layout">
        <DropdownItem
          onclick={() => handleSpreadMode(SpreadMode.None)}
          isActive={spread.spreadMode === SpreadMode.None}
        >
          {#snippet icon()}
            <SinglePageIcon class="h-4 w-4" title="Single Page" />
          {/snippet}
          Single Page
        </DropdownItem>
        <DropdownItem
          onclick={() => handleSpreadMode(SpreadMode.Odd)}
          isActive={spread.spreadMode === SpreadMode.Odd}
        >
          {#snippet icon()}
            <BookOpenIcon class="h-4 w-4" title="Odd Pages" />
          {/snippet}
          Odd Pages
        </DropdownItem>
        <DropdownItem
          onclick={() => handleSpreadMode(SpreadMode.Even)}
          isActive={spread.spreadMode === SpreadMode.Even}
        >
          {#snippet icon()}
            <BookOpenIcon class="h-4 w-4" title="Even Pages" />
          {/snippet}
          Even Pages
        </DropdownItem>
      </DropdownSection>
    </DropdownMenu>
  </div>
{/if}
