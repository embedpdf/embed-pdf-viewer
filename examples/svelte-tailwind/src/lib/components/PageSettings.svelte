<script lang="ts">
  import { useRotateCapability } from '@embedpdf/plugin-rotate/svelte';
  import { useSpread } from '@embedpdf/plugin-spread/svelte';
  import { SpreadMode } from '@embedpdf/plugin-spread';
  import { clickOutside } from '../actions/click-outside';

  const rotate = useRotateCapability();
  const spread = useSpread();

  let isOpen = $state(false);

  const toggleMenu = () => {
    isOpen = !isOpen;
  };

  const closeMenu = () => {
    isOpen = false;
  };

  const handleRotateClockwise = () => {
    rotate?.provides?.rotateForward();
    closeMenu();
  };

  const handleRotateCounterClockwise = () => {
    rotate?.provides?.rotateBackward();
    closeMenu();
  };

  const handleSpreadMode = (mode: SpreadMode) => {
    spread.provides?.setSpreadMode(mode);
    closeMenu();
  };
</script>

<div class="relative flex items-center" use:clickOutside={closeMenu}>
  <button
    class="flex h-8 w-8 items-center justify-center text-gray-100 rounded-full transition-colors {isOpen
      ? 'bg-gray-200 text-gray-900'
      : 'hover:bg-gray-100 hover:text-gray-900'}"
    onclick={toggleMenu}
    title="Page Settings"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path
        d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"
      />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </svg>
  </button>

  {#if isOpen}
    <div
      class="absolute left-0 top-full z-50 mt-2 w-56 origin-top-left rounded border border-gray-200 bg-white shadow-lg"
    >
      <!-- Page Orientation Section -->
      <div class="p-1">
        <div class="mb-1 px-3 py-1 text-xs font-medium text-gray-500">Page Orientation</div>
        <button
          class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
          onclick={handleRotateClockwise}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="shrink-0 text-gray-500"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M15 4.55a8 8 0 0 0 -6 14.9m0 -4.45v5h-5" />
            <path d="M18.37 7.16l0 .01" />
            <path d="M13 19.94l0 .01" />
            <path d="M16.84 18.37l0 .01" />
            <path d="M19.37 15.1l0 .01" />
            <path d="M19.94 11l0 .01" />
          </svg>
          <span>Rotate Clockwise</span>
        </button>
        <button
          class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
          onclick={handleRotateCounterClockwise}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="shrink-0 text-gray-500"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M9 4.55a8 8 0 0 1 6 14.9m0 -4.45v5h5" />
            <path d="M5.63 7.16l0 .01" />
            <path d="M4.06 11l0 .01" />
            <path d="M4.63 15.1l0 .01" />
            <path d="M7.16 18.37l0 .01" />
            <path d="M11 19.94l0 .01" />
          </svg>
          <span>Rotate Counter-clockwise</span>
        </button>
      </div>

      <!-- Divider -->
      <div class="my-1 h-px bg-gray-200"></div>

      <!-- Page Layout Section -->

      <div class="p-1">
        <div class="mb-1 px-3 py-1 text-xs font-medium text-gray-500">Page Layout</div>
        <button
          class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm transition-colors {spread.spreadMode ===
          SpreadMode.None
            ? 'bg-gray-100 text-gray-900'
            : 'text-gray-700 hover:bg-gray-50'}"
          onclick={() => handleSpreadMode(SpreadMode.None)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="shrink-0 text-gray-500"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
            <path d="M9 9l1 0" />
            <path d="M9 13l6 0" />
            <path d="M9 17l6 0" />
          </svg>
          <span>Single Page</span>
        </button>
        <button
          class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm transition-colors {spread.spreadMode ===
          SpreadMode.Odd
            ? 'bg-gray-100 text-gray-900'
            : 'text-gray-700 hover:bg-gray-50'}"
          onclick={() => handleSpreadMode(SpreadMode.Odd)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="shrink-0 text-gray-500"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M3 7h2m14 0h2" />
            <path d="M3 11h2m14 0h2" />
            <path d="M3 15h2m14 0h2" />
            <path
              d="M12 3m0 2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2z"
            />
            <path
              d="M4 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"
            />
          </svg>
          <span>Odd Pages</span>
        </button>
        <button
          class="flex w-full items-center justify-start gap-2 px-3 py-1.5 text-left text-sm transition-colors {spread.spreadMode ===
          SpreadMode.Even
            ? 'bg-gray-100 text-gray-900'
            : 'text-gray-700 hover:bg-gray-50'}"
          onclick={() => handleSpreadMode(SpreadMode.Even)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="shrink-0 text-gray-500"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M3 7h2m14 0h2" />
            <path d="M3 11h2m14 0h2" />
            <path d="M3 15h2m14 0h2" />
            <path
              d="M12 3m0 2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2z"
            />
            <path
              d="M4 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"
            />
          </svg>
          <span>Even Pages</span>
        </button>
      </div>
    </div>
  {/if}
</div>
